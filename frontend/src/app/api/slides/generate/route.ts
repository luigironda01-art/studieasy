import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const openrouter = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY! });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  try {
    const { sourceId, chapterId, userId } = await request.json();
    if (!sourceId || !userId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch text — prefer summaries if available (richer, more concise)
    let text = "";
    let title = "";
    if (chapterId) {
      const { data: chapter } = await supabase
        .from("chapters")
        .select("title, processed_text")
        .eq("id", chapterId)
        .single();
      if (!chapter?.processed_text) {
        return NextResponse.json({ error: "Chapter text not available" }, { status: 400 });
      }
      title = chapter.title;

      // Try to use summary if available (better quality content)
      const { data: summary } = await supabase
        .from("summaries")
        .select("content")
        .eq("chapter_id", chapterId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      text = summary?.content
        ? `[RIASSUNTO AI]\n${summary.content}\n\n[TESTO ORIGINALE]\n${chapter.processed_text.slice(0, 8000)}`
        : chapter.processed_text.slice(0, 14000);
    } else {
      const { data: source } = await supabase.from("sources").select("title").eq("id", sourceId).single();
      const { data: chapters } = await supabase
        .from("chapters")
        .select("id, title, processed_text")
        .eq("source_id", sourceId)
        .eq("processing_status", "completed")
        .order("order_index");
      if (!chapters?.length) {
        return NextResponse.json({ error: "No processed chapters found" }, { status: 400 });
      }
      title = source?.title || "Libro";

      // Fetch summaries for all chapters
      const chapterIds = chapters.map((c: { id: string }) => c.id);
      const { data: summaries } = await supabase
        .from("summaries")
        .select("chapter_id, content")
        .in("chapter_id", chapterIds)
        .eq("user_id", userId);
      const summaryMap = new Map(
        (summaries || []).map((s: { chapter_id: string; content: string }) => [s.chapter_id, s.content])
      );

      text = chapters
        .map((c: { id: string; title: string; processed_text: string | null }) => {
          const summary = summaryMap.get(c.id);
          return summary
            ? `## ${c.title}\n${summary}`
            : `## ${c.title}\n${c.processed_text || ""}`;
        })
        .join("\n\n")
        .slice(0, 18000);
    }

    // Check for existing presentation
    const query = supabase.from("presentations").select("id, content").eq("source_id", sourceId).eq("user_id", userId);
    if (chapterId) query.eq("chapter_id", chapterId);
    const { data: existing } = await query.single();
    if (existing) {
      return NextResponse.json({ presentation: existing.content, id: existing.id });
    }

    const prompt = `Sei un docente universitario esperto. Crea una presentazione didattica COMPLETA e DETTAGLIATA in formato JSON dal seguente testo.

REGOLE FONDAMENTALI:
- Crea tra 15 e 25 slide per coprire tutto il contenuto in modo approfondito
- Prima slide: tipo "title" con titolo e sottotitolo accattivante
- Ultima slide: tipo "summary" con 6-8 punti chiave da ricordare
- VARIA i tipi di slide: usa TUTTI i tipi disponibili, non solo "content"
- Ogni slide deve essere autonoma e comprensibile da sola
- Bullets: 3-6 per slide, ogni bullet deve essere una frase completa e chiara (15-25 parole)
- Lingua: italiano
- Formule: SEMPRE in LaTeX valido (es: $$E = mc^2$$). NON usare [FORMULA:...] mai
- Per ogni formula, includi una spiegazione chiara di cosa rappresenta ogni simbolo
- Includi almeno 2-3 slide "definition" per i concetti chiave
- Includi almeno 1-2 slide "comparison" per confronti importanti
- Includi slide "formula" per OGNI equazione importante del testo

TIPI DI SLIDE DISPONIBILI:
1. title: { type: "title", title: string, subtitle: string }
2. content: { type: "content", title: string, bullets: string[], note?: string }
3. formula: { type: "formula", title: string, latex: string (LaTeX puro SENZA $$), explanation: string }
4. comparison: { type: "comparison", title: string, left: { label: string, points: string[] }, right: { label: string, points: string[] } }
5. timeline: { type: "timeline", title: string, steps: { label: string, description: string }[] }
6. summary: { type: "summary", title: string, points: string[] }
7. definition: { type: "definition", term: string, definition: string, details: string[], example?: string }

ESEMPIO slide formula:
{ "type": "formula", "title": "Energia cinetica", "latex": "E_k = \\\\frac{1}{2}mv^2", "explanation": "Dove m è la massa del corpo e v la sua velocità. L'energia cinetica cresce con il quadrato della velocità." }

ESEMPIO slide definition:
{ "type": "definition", "term": "Funzione d'onda", "definition": "Funzione matematica ψ(x) che descrive lo stato quantistico di una particella", "details": ["Il suo modulo quadro |ψ|² rappresenta la densità di probabilità", "Deve essere continua, normalizzabile e a quadrato integrabile"], "example": "Per una particella nella scatola: ψₙ(x) = √(2/L) sin(nπx/L)" }

TESTO DA TRASFORMARE:
${text}

Rispondi SOLO con JSON valido (nessun testo prima o dopo):
{
  "title": "${title}",
  "slides": [...]
}`;

    const response = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    let raw = response.choices[0]?.message?.content || "";
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let presentationData;
    try {
      presentationData = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON from AI" }, { status: 500 });
    }

    // Save to DB
    const insertData: Record<string, unknown> = {
      source_id: sourceId,
      user_id: userId,
      content: presentationData,
    };
    if (chapterId) insertData.chapter_id = chapterId;

    const { data: saved, error: saveError } = await supabase
      .from("presentations")
      .insert(insertData)
      .select("id")
      .single();

    if (saveError) console.error("Error saving presentation:", saveError);

    return NextResponse.json({ presentation: presentationData, id: saved?.id });
  } catch (err) {
    console.error("Slides generation error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  try {
    const { sourceId, chapterId, userId } = await request.json();
    const query = supabase.from("presentations").delete().eq("source_id", sourceId).eq("user_id", userId);
    if (chapterId) query.eq("chapter_id", chapterId);
    await query;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Slides delete error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

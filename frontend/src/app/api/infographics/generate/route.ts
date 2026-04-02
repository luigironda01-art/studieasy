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

    // Fetch text — prefer summaries
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

      const { data: summary } = await supabase
        .from("summaries")
        .select("content")
        .eq("chapter_id", chapterId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      text = summary?.content || chapter.processed_text.slice(0, 14000);
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
          return summary ? `## ${c.title}\n${summary}` : `## ${c.title}\n${c.processed_text || ""}`;
        })
        .join("\n\n")
        .slice(0, 18000);
    }

    // Check existing
    const query = supabase.from("infographics").select("id, content").eq("source_id", sourceId).eq("user_id", userId);
    if (chapterId) query.eq("chapter_id", chapterId);
    else query.is("chapter_id", null);
    const { data: existing } = await query.single();
    if (existing) {
      return NextResponse.json({ infographic: existing.content, id: existing.id });
    }

    const prompt = `Sei un designer di infografiche educative. Analizza il testo e crea un'infografica strutturata in JSON.

REGOLE:
- L'infografica deve riassumere visivamente i concetti chiave del testo
- Usa sezioni diverse per rendere i dati visualmente ricchi e vari
- Lingua: italiano
- Formule in LaTeX puro (es: E = mc^2, NON $$...$$ e NON [FORMULA:])
- Massimo 8-12 sezioni totali
- Ogni sezione deve essere autonoma e informativa

TIPI DI SEZIONE DISPONIBILI:

1. "hero" — Header principale dell'infografica
   { "type": "hero", "title": "...", "subtitle": "...", "icon": "emoji" }

2. "stats" — Numeri chiave / fatti importanti (3-4 items)
   { "type": "stats", "title": "...", "items": [{ "value": "...", "label": "...", "icon": "emoji" }] }

3. "concepts" — Concetti chiave con spiegazione breve (3-6 items)
   { "type": "concepts", "title": "...", "items": [{ "term": "...", "description": "...", "color": "blue|purple|emerald|amber|rose|cyan" }] }

4. "flow" — Processo / flusso sequenziale (3-6 steps)
   { "type": "flow", "title": "...", "steps": [{ "label": "...", "description": "..." }] }

5. "comparison" — Confronto tra due elementi
   { "type": "comparison", "title": "...", "left": { "label": "...", "points": ["..."], "color": "blue" }, "right": { "label": "...", "points": ["..."], "color": "purple" } }

6. "formulas" — Formule chiave con spiegazione (2-4 items)
   { "type": "formulas", "title": "...", "items": [{ "name": "...", "latex": "LaTeX puro", "meaning": "..." }] }

7. "timeline" — Evoluzione / cronologia (3-6 items)
   { "type": "timeline", "title": "...", "events": [{ "label": "...", "description": "..." }] }

8. "keypoints" — Punti chiave finali / takeaway (4-6 items)
   { "type": "keypoints", "title": "...", "points": ["..."] }

9. "relationships" — Relazioni tra concetti (3-5 items)
   { "type": "relationships", "title": "...", "items": [{ "from": "...", "to": "...", "relation": "..." }] }

10. "categories" — Categorie con lista di elementi (2-4 categorie)
    { "type": "categories", "title": "...", "groups": [{ "name": "...", "items": ["..."], "color": "blue|purple|emerald|amber" }] }

STRUTTURA IDEALE:
1. hero (sempre primo)
2. stats o concepts
3. formulas (se ci sono equazioni)
4. flow o timeline
5. comparison (se ci sono confronti)
6. relationships o categories
7. keypoints (sempre ultimo)

TESTO:
${text}

Rispondi SOLO con JSON valido:
{
  "title": "${title}",
  "sections": [...]
}`;

    const response = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    let raw = response.choices[0]?.message?.content || "";
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let infographicData;
    try {
      infographicData = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON from AI" }, { status: 500 });
    }

    const insertData: Record<string, unknown> = {
      source_id: sourceId,
      user_id: userId,
      content: infographicData,
    };
    if (chapterId) insertData.chapter_id = chapterId;

    const { data: saved, error: saveError } = await supabase
      .from("infographics")
      .insert(insertData)
      .select("id")
      .single();

    if (saveError) console.error("Error saving infographic:", saveError);

    return NextResponse.json({ infographic: infographicData, id: saved?.id });
  } catch (err) {
    console.error("Infographics generation error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  try {
    const { sourceId, chapterId, userId } = await request.json();
    const query = supabase.from("infographics").delete().eq("source_id", sourceId).eq("user_id", userId);
    if (chapterId) query.eq("chapter_id", chapterId);
    else query.is("chapter_id", null);
    await query;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Infographics delete error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

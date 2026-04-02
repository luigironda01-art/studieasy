import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { trackGeneration, updateGeneration } from "@/lib/generations";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const openrouter = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY! });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  try {
    const { sourceId, chapterId, userId } = await request.json();
    if (!sourceId || !userId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch text: single chapter or combine all chapters
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
      text = chapter.processed_text.slice(0, 12000);
      title = chapter.title;
    } else {
      const { data: source } = await supabase.from("sources").select("title").eq("id", sourceId).single();
      const { data: chapters } = await supabase
        .from("chapters")
        .select("title, processed_text")
        .eq("source_id", sourceId)
        .eq("processing_status", "completed")
        .order("order_index");
      if (!chapters?.length) {
        return NextResponse.json({ error: "No processed chapters found" }, { status: 400 });
      }
      title = source?.title || "Libro";
      text = chapters
        .map(c => `## ${c.title}\n${c.processed_text || ""}`)
        .join("\n\n")
        .slice(0, 12000);
    }

    // Check for existing mindmap
    const query = supabase.from("mindmaps").select("id, content").eq("source_id", sourceId).eq("user_id", userId);
    if (chapterId) query.eq("chapter_id", chapterId);
    const { data: existing } = await query.single();
    if (existing) {
      return NextResponse.json({ mindmap: existing.content, id: existing.id });
    }

    const genId = await trackGeneration(userId, sourceId, "mindmap", chapterId || null);

    const prompt = `Analizza il seguente testo e genera una mappa concettuale PROFONDA e DETTAGLIATA in formato JSON.

REGOLE:
- centralTopic: il titolo principale dell'argomento
- nodes: array di nodi. Ogni nodo ha: id (stringa univoca), label (testo breve max 6 parole), category (concept|principle|formula|example|definition|process), e opzionalmente parent (id del nodo padre)
- Crea una struttura ad ALBERO PROFONDO con 3-4 livelli di profondità:
  - Livello 1: 6-10 macro-argomenti (figli del centro)
  - Livello 2: 2-4 sotto-argomenti per ogni nodo di livello 1
  - Livello 3: 1-3 dettagli specifici per ogni nodo di livello 2 (formule, esempi, definizioni)
  - Livello 4 (opzionale): dettagli ulteriori dove serve
- Genera almeno 40-60 nodi totali per coprire bene il materiale
- Usa l'italiano
- Le label devono essere concise e descrittive
- Assicurati che ogni nodo con parent faccia riferimento a un id esistente

TESTO:
${text}

Rispondi SOLO con JSON valido, senza markdown o testo extra:
{
  "centralTopic": "${title}",
  "nodes": [
    { "id": "n1", "label": "...", "category": "concept" },
    { "id": "n1_1", "label": "...", "category": "definition", "parent": "n1" },
    { "id": "n1_1_1", "label": "...", "category": "formula", "parent": "n1_1" }
  ]
}`;

    const response = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    let raw = response.choices[0]?.message?.content || "";
    // Strip markdown code fences if present
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();

    let mindmapData;
    try {
      mindmapData = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON from AI" }, { status: 500 });
    }

    // Save to DB
    const insertData: Record<string, unknown> = {
      source_id: sourceId,
      user_id: userId,
      content: mindmapData,
    };
    if (chapterId) insertData.chapter_id = chapterId;

    const { data: saved, error: saveError } = await supabase
      .from("mindmaps")
      .insert(insertData)
      .select("id")
      .single();

    if (saveError) console.error("Error saving mindmap:", saveError);

    if (genId) await updateGeneration(genId, { status: "completed", progress: 100, result_url: `/dashboard/source/${sourceId}/mindmap` });

    return NextResponse.json({ mindmap: mindmapData, id: saved?.id });
  } catch (err) {
    console.error("Mindmap generation error:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  try {
    const { sourceId, chapterId, userId } = await request.json();
    const query = supabase.from("mindmaps").delete().eq("source_id", sourceId).eq("user_id", userId);
    if (chapterId) query.eq("chapter_id", chapterId);
    await query;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Mindmap delete error:", err);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}

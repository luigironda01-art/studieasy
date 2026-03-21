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

    // Fetch text
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
      text = chapter.processed_text.slice(0, 14000);
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
        .slice(0, 14000);
    }

    // Check for existing presentation
    const query = supabase.from("presentations").select("id, content").eq("source_id", sourceId).eq("user_id", userId);
    if (chapterId) query.eq("chapter_id", chapterId);
    const { data: existing } = await query.single();
    if (existing) {
      return NextResponse.json({ presentation: existing.content, id: existing.id });
    }

    const prompt = `Analizza il seguente testo e crea una presentazione didattica professionale in formato JSON.

REGOLE:
- Crea tra 8 e 12 slide
- Prima slide: sempre di tipo "title" con titolo e sottotitolo
- Ultima slide: sempre di tipo "summary" con i punti chiave
- Slide intermedie: misto di "content", "formula", "comparison", "timeline"
- Ogni slide deve essere autocontenuta e leggibile
- Testo conciso: max 5 bullet points per slide, max 10 parole per bullet
- Usa l'italiano
- Per le formule usa LaTeX tra $$ $$

TIPI DI SLIDE:
- title: { type, title, subtitle }
- content: { type, title, bullets: string[], note?: string }
- formula: { type, title, latex: string, explanation: string }
- comparison: { type, title, left: { label, points: string[] }, right: { label, points: string[] } }
- timeline: { type, title, steps: { label, description }[] }
- summary: { type, title, points: string[] }

TESTO:
${text}

Rispondi SOLO con JSON valido:
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

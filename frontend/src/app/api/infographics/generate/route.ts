import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

      text = summary?.content || chapter.processed_text.slice(0, 10000);
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
          return summary ? `## ${c.title}\n${summary}` : `## ${c.title}\n${(c.processed_text || "").slice(0, 2000)}`;
        })
        .join("\n\n")
        .slice(0, 12000);
    }

    // Check existing
    const query = supabase.from("infographics").select("id, content").eq("source_id", sourceId).eq("user_id", userId);
    if (chapterId) query.eq("chapter_id", chapterId);
    else query.is("chapter_id", null);
    const { data: existing } = await query.single();
    if (existing) {
      return NextResponse.json({ infographic: existing.content, id: existing.id });
    }

    // Step 1: Extract key content with a fast text model
    const extractPrompt = `Analizza questo testo di studio e crea un riassunto strutturato per un'infografica educativa.
Estrai:
1. Titolo principale
2. 3-4 concetti chiave (termine + definizione breve)
3. 2-3 formule importanti (scritte in notazione matematica chiara)
4. Un processo/flusso in 4-5 step
5. Un confronto tra 2 elementi (se presente)
6. 4-5 punti chiave da ricordare
7. Relazioni tra concetti

Rispondi in italiano, in modo conciso. Max 800 parole.

TESTO:
${text}`;

    const extractResponse = await openrouter.chat.completions.create({
      model: "google/gemini-2.0-flash-001",
      messages: [{ role: "user", content: extractPrompt }],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const extractedContent = extractResponse.choices[0]?.message?.content || "";

    // Step 2: Generate infographic image with Gemini Image model
    const imagePrompt = `Genera un'infografica educativa professionale in stile editoriale per il seguente argomento universitario.

TITOLO: "${title}"

CONTENUTO DA VISUALIZZARE:
${extractedContent}

STILE DELL'INFOGRAFICA:
- Layout: orizzontale (landscape), diviso in 2-3 colonne principali
- Sfondo: gradiente morbido da blu scuro a viola scuro
- Tipografia: titoli grandi e chiari, testo leggibile
- Colori: palette professionale (blu, viola, turchese, emerald su sfondo scuro)
- Includere: diagrammi schematici, frecce di collegamento, box colorati per i concetti
- Le formule matematiche devono essere scritte in modo chiaro e leggibile
- Stile simile alle infografiche di NotebookLM di Google
- Ogni sezione deve avere un'icona o illustrazione schematica
- Tabelle comparative con bordi chiari
- Flussi con frecce direzionali
- NON includere testo troppo piccolo
- L'infografica deve essere autoesplicativa e completa
- Aspetto moderno, pulito, professionale`;

    const imageResponse = await openrouter.chat.completions.create({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: imagePrompt }],
    });

    // Extract image from response
    const choice = imageResponse.choices[0];
    let imageBase64 = "";
    const msg = choice?.message;

    // Check for inline_data in parts (Gemini image response format)
    if (msg && Array.isArray((msg as unknown as Record<string, unknown>).content)) {
      const parts = (msg as unknown as Record<string, unknown>).content as Array<Record<string, unknown>>;
      for (const part of parts) {
        if (part.type === "image_url" && part.image_url) {
          const url = (part.image_url as Record<string, string>).url || "";
          if (url.startsWith("data:image")) {
            imageBase64 = url;
          }
        }
      }
    }

    // Also check if the content itself has base64 image data
    if (!imageBase64 && msg?.content && typeof msg.content === "string") {
      // Some models return base64 directly or as a URL
      const b64Match = (msg.content as string).match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
      if (b64Match) {
        imageBase64 = b64Match[0];
      }
    }

    if (!imageBase64) {
      // Fallback: try to get URL from response
      console.log("Image response structure:", JSON.stringify(choice, null, 2).slice(0, 2000));
      return NextResponse.json({ error: "Image generation failed - no image in response" }, { status: 500 });
    }

    // Upload image to Supabase Storage
    const imageBuffer = Buffer.from(imageBase64.replace(/^data:image\/[^;]+;base64,/, ""), "base64");
    const fileName = `infographics/${userId}/${sourceId}/${chapterId || "full"}_${Date.now()}.png`;

    const { error: uploadError } = await supabase.storage
      .from("files")
      .upload(fileName, imageBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      // Still save with base64 as fallback
    }

    const { data: publicUrlData } = supabase.storage.from("files").getPublicUrl(fileName);
    const imageUrl = publicUrlData?.publicUrl || imageBase64;

    const infographicData = {
      title,
      imageUrl,
      extractedContent,
      generatedAt: new Date().toISOString(),
    };

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

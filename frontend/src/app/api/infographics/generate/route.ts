import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { trackGeneration, updateGeneration } from "@/lib/generations";
import { validateUserId } from "@/lib/auth-server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const openrouter = new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY! });
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  try {
    const { sourceId, chapterId, userId: bodyUserId } = await request.json();
    if (!sourceId) {
      return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
    }
    const { userId, error: authError } = await validateUserId(request, bodyUserId);
    if (!userId) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: 401 });
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

    const genId = await trackGeneration(userId, sourceId, "infographic", chapterId || null);

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

    // Step 2: Generate infographic image with Nano Banana Pro (Gemini 3 Pro Image)
    const imagePrompt = `Create a professional educational infographic in horizontal landscape format (16:9 aspect ratio, 2K resolution) about this university-level topic.

TITLE: "${title}"

CONTENT TO VISUALIZE (all text MUST be written in ITALIAN exactly as provided):
${extractedContent}

CRITICAL TEXT RULES:
- ALL text labels, headings, formulas, and explanations MUST be in Italian
- Spell every word EXACTLY as written above — no inventing, no shortening, no translation
- Mathematical formulas MUST be rendered with proper math typography (fractions, exponents, Greek letters, integrals)
- Use the EXACT formulas provided, not approximations

VISUAL STYLE:
- Layout: editorial magazine-style infographic, 2-3 vertical columns of content
- Background: dark navy blue gradient with subtle decorative elements
- Color palette: navy/dark-blue background with electric blue, purple, cyan, and emerald accents
- Typography: clear bold sans-serif headings, highly readable body text
- Each section: rounded card with subtle border, clear icon or schematic diagram
- Diagrams: schematic illustrations of the actual scientific concepts (energy levels, wave functions, particle in a box, etc.)
- Connecting elements: arrows, lines, flow indicators between related concepts
- Comparison tables: bordered cells with clear column headers
- Mathematical formulas displayed in beautiful boxed equation blocks
- Decorative scientific elements relevant to the topic (atoms, waves, graphs)

QUALITY REQUIREMENTS:
- Professional editorial design quality (NotebookLM-tier)
- All Italian text must be perfectly spelled and grammatically correct
- High information density but visually clean and organized
- Self-explanatory: viewer should understand the topic from the infographic alone
- Modern, premium look with refined typography and color use`;

    const imageResponse = await openrouter.chat.completions.create({
      model: "google/gemini-3-pro-image-preview",
      messages: [{ role: "user", content: imagePrompt }],
    });

    // Extract image from response — OpenRouter returns images in msg.images[]
    const msg = imageResponse.choices[0]?.message;
    const msgAny = msg as unknown as Record<string, unknown>;
    const images = msgAny?.images as Array<{ type: string; image_url: { url: string } }> | undefined;
    let imageBase64 = "";

    if (images && images.length > 0) {
      imageBase64 = images[0]?.image_url?.url || "";
    }

    // Fallback: check content string for embedded base64
    if (!imageBase64 && msg?.content && typeof msg.content === "string") {
      const b64Match = msg.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/);
      if (b64Match) imageBase64 = b64Match[0];
    }

    if (!imageBase64) {
      if (genId) await updateGeneration(genId, { status: "failed" });
      return NextResponse.json({ error: "Image generation failed - no image in response" }, { status: 500 });
    }

    // Upload image to Supabase Storage
    const imageBuffer = Buffer.from(imageBase64.replace(/^data:image\/[^;]+;base64,/, ""), "base64");
    const fileName = `infographics/${userId}/${sourceId}/${chapterId || "full"}_${Date.now()}.png`;

    let imageUrl = imageBase64; // fallback to base64

    const { error: uploadError } = await supabase.storage
      .from("summary-images")
      .upload(fileName, imageBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
    } else {
      const { data: publicUrlData } = supabase.storage.from("summary-images").getPublicUrl(fileName);
      if (publicUrlData?.publicUrl) imageUrl = publicUrlData.publicUrl;
    }

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

    if (genId) await updateGeneration(genId, { status: "completed", progress: 100, result_url: `/dashboard/source/${sourceId}/infographics` });

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

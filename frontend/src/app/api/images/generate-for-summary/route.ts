import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const MAX_IMAGES = 5;

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    const { sourceId, userId } = await request.json();

    if (!sourceId || !userId) {
      return NextResponse.json(
        { error: "Missing sourceId or userId" },
        { status: 400 }
      );
    }

    // Verify source belongs to user
    const { data: source } = await supabase
      .from("sources")
      .select("id, title, user_id")
      .eq("id", sourceId)
      .single();

    if (!source || source.user_id !== userId) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Check if images already exist for this source
    const { data: existingImages } = await supabase
      .from("summary_images")
      .select("id")
      .eq("source_id", sourceId);

    if (existingImages && existingImages.length > 0) {
      // Delete old images from storage and DB
      for (const img of existingImages) {
        await supabase.storage
          .from("summary-images")
          .remove([`${sourceId}/${img.id}.png`]);
      }
      await supabase
        .from("summary_images")
        .delete()
        .eq("source_id", sourceId);
    }

    // Fetch all chapter summaries for this source
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id, title, order_index")
      .eq("source_id", sourceId)
      .order("order_index");

    if (!chapters || chapters.length === 0) {
      return NextResponse.json({ error: "No chapters found" }, { status: 404 });
    }

    const chapterIds = chapters.map((c) => c.id);
    const { data: summaries } = await supabase
      .from("summaries")
      .select("chapter_id, content")
      .in("chapter_id", chapterIds);

    if (!summaries || summaries.length === 0) {
      return NextResponse.json(
        { error: "No summaries found. Generate chapter summaries first." },
        { status: 400 }
      );
    }

    // Assemble full summary text (ordered by chapter)
    const summaryMap: Record<string, string> = {};
    for (const s of summaries) {
      summaryMap[s.chapter_id] = s.content;
    }
    const fullText = chapters
      .map((c) => summaryMap[c.id] || "")
      .filter(Boolean)
      .join("\n\n---\n\n");

    if (!fullText || fullText.length < 100) {
      return NextResponse.json(
        { error: "Summary text too short for image generation" },
        { status: 400 }
      );
    }

    // Step 1: Analyze text to identify 5 key topics for images
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "No OpenRouter API key" },
        { status: 500 }
      );
    }

    // Truncate for analysis (keep it efficient)
    const truncated = fullText.length > 15000 ? fullText.substring(0, 15000) : fullText;

    const analyzeRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-lite-001",
        messages: [
          {
            role: "system",
            content: `Sei un assistente che analizza testi di studio universitario. Il tuo compito è identificare esattamente ${MAX_IMAGES} argomenti chiave del testo dove un'immagine educativa migliorerebbe significativamente la comprensione dello studente.

Per ogni argomento, genera:
- "title": titolo breve dell'argomento (5-10 parole)
- "description": descrizione DETTAGLIATA dell'immagine da generare. Deve essere un diagramma, schema, struttura molecolare, processo, o illustrazione educativa. Includi dettagli su cosa mostrare, etichette, colori, stile.
- "anchor": una frase dal testo (15-30 parole) vicino a dove l'immagine andrebbe inserita

CRITERI DI SELEZIONE:
- Scegli argomenti DIVERSI distribuiti in tutto il testo
- Preferisci: strutture molecolari, processi biochimici, diagrammi di flusso, schemi concettuali, meccanismi di reazione
- Evita: concetti puramente testuali, definizioni semplici, elenchi

Rispondi SOLO con un JSON array di ${MAX_IMAGES} elementi. Nessun altro testo.`,
          },
          { role: "user", content: truncated },
        ],
        temperature: 0.1,
      }),
    });

    if (!analyzeRes.ok) {
      return NextResponse.json(
        { error: "Analysis failed" },
        { status: 502 }
      );
    }

    const analyzeData = await analyzeRes.json();
    let analysisContent = analyzeData.choices?.[0]?.message?.content || "";

    // Parse JSON
    analysisContent = analysisContent.trim();
    if (analysisContent.startsWith("```")) {
      analysisContent = analysisContent
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "");
    }

    let suggestions: Array<{
      title: string;
      description: string;
      anchor: string;
    }>;

    try {
      suggestions = JSON.parse(analysisContent);
      if (!Array.isArray(suggestions)) {
        throw new Error("Not an array");
      }
      suggestions = suggestions
        .filter((s) => s.title && s.description)
        .slice(0, MAX_IMAGES);
    } catch {
      console.error("Failed to parse image suggestions:", analysisContent.substring(0, 300));
      return NextResponse.json(
        { error: "Failed to analyze text for images" },
        { status: 500 }
      );
    }

    if (suggestions.length === 0) {
      return NextResponse.json({
        success: true,
        images: [],
        message: "No suitable topics found for images",
      });
    }

    // Step 2: Generate images one by one
    const IMAGE_MODELS = [
      "google/gemini-3.1-flash-image-preview",
      "google/gemini-3-pro-image-preview",
    ];

    const generatedImages: Array<{
      title: string;
      description: string;
      anchor: string;
      imageUrl: string;
      positionIndex: number;
    }> = [];

    for (let i = 0; i < suggestions.length; i++) {
      const suggestion = suggestions[i];

      // Detect language for image labels
      const italianWords =
        /\b(della|delle|degli|nella|nelle|con|che|una|sono|tra|per|più|questo|questa)\b/i;
      const isItalian = italianWords.test(suggestion.description);
      const langLabel = isItalian ? "ITALIANO" : "the same language as the description";
      const langInstruction = isItalian
        ? "TUTTE le etichette, scritte, testi e label nell'immagine DEVONO essere in ITALIANO."
        : "All labels and text in the image MUST match the description language.";

      const prompt = `Create an educational illustration for a university study document.

Subject: ${suggestion.description}

Style: Clean, academic, informative. Suitable for a textbook.
Professional quality, clear diagram/illustration.

CRITICAL LANGUAGE REQUIREMENT: ${langInstruction}
Language for ALL text in the image: ${langLabel}`;

      let imageBase64: string | null = null;

      for (const model of IMAGE_MODELS) {
        try {
          const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages: [
                {
                  role: "system",
                  content: `You are an educational illustrator. Create clear, professional diagrams for university textbooks. All text in images MUST be in ${langLabel}.`,
                },
                { role: "user", content: prompt },
              ],
              modalities: ["image", "text"],
            }),
          });

          if (!res.ok) continue;

          const data = await res.json();
          const msg = data.choices?.[0]?.message;
          if (!msg) continue;

          // Extract base64 image from response
          if (Array.isArray(msg.images)) {
            for (const img of msg.images) {
              const url = img.image_url?.url || img.url;
              if (url?.startsWith("data:")) {
                const m = url.match(/^data:[^;]+;base64,(.+)$/);
                if (m) { imageBase64 = m[1]; break; }
              }
            }
          }

          if (!imageBase64 && Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === "image_url" && part.image_url?.url?.startsWith("data:")) {
                const m = part.image_url.url.match(/^data:[^;]+;base64,(.+)$/);
                if (m) { imageBase64 = m[1]; break; }
              }
              if (part.type === "image" && part.source?.type === "base64") {
                imageBase64 = part.source.data;
                break;
              }
            }
          }

          if (imageBase64) break;
        } catch (err) {
          console.warn(`Image model ${model} failed for "${suggestion.title}":`, err);
        }
      }

      if (!imageBase64) {
        console.warn(`Could not generate image for: ${suggestion.title}`);
        continue;
      }

      // Step 3: Upload to Supabase Storage
      const imageBuffer = Buffer.from(imageBase64, "base64");
      const imagePath = `${sourceId}/${i}.png`;

      const { error: uploadError } = await supabase.storage
        .from("summary-images")
        .upload(imagePath, imageBuffer, {
          contentType: "image/png",
          upsert: true,
        });

      if (uploadError) {
        console.error(`Upload failed for ${imagePath}:`, uploadError);
        continue;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("summary-images")
        .getPublicUrl(imagePath);

      const imageUrl = urlData.publicUrl;

      // Step 4: Save metadata to DB
      const { error: dbError } = await supabase.from("summary_images").insert({
        source_id: sourceId,
        title: suggestion.title,
        description: suggestion.description,
        image_url: imageUrl,
        position_index: i,
        anchor_text: suggestion.anchor || null,
      });

      if (dbError) {
        console.error(`DB insert failed:`, dbError);
        continue;
      }

      generatedImages.push({
        title: suggestion.title,
        description: suggestion.description,
        anchor: suggestion.anchor,
        imageUrl,
        positionIndex: i,
      });

      console.log(`Generated image ${i + 1}/${suggestions.length}: "${suggestion.title}"`);
    }

    return NextResponse.json({
      success: true,
      images: generatedImages,
      total: generatedImages.length,
      message: `Generate ${generatedImages.length} immagini per il riassunto`,
    });
  } catch (error) {
    console.error("Summary image generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}

// GET: Fetch existing images for a source
export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const sourceId = request.nextUrl.searchParams.get("sourceId");
  if (!sourceId) {
    return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("summary_images")
    .select("*")
    .eq("source_id", sourceId)
    .order("position_index");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ images: data || [] });
}

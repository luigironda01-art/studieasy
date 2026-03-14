import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

// Models to try in order (via OpenRouter)
const IMAGE_MODELS = [
  "google/gemini-3.1-flash-image-preview",
  "google/gemini-3-pro-image-preview",
];

export async function POST(request: NextRequest) {
  try {
    const { description } = await request.json();

    if (!description) {
      return NextResponse.json(
        { error: "Missing description" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "No OpenRouter API key configured" },
        { status: 500 }
      );
    }

    const prompt = `Genera un'illustrazione chiara ed educativa per un documento di studio universitario.
L'immagine deve rappresentare: ${description}
Stile: Pulito, accademico, informativo. Adatto per un libro di testo o materiale di studio.
IMPORTANTE: Tutte le etichette, i testi e le scritte nell'immagine DEVONO essere nella STESSA LINGUA del testo qui sopra. Se il testo è in italiano, le etichette devono essere in italiano. MAI usare spagnolo o altre lingue diverse da quella del documento.
Qualità professionale.`;

    // Try each model via raw fetch to OpenRouter (not OpenAI SDK)
    // because OpenRouter returns images in non-standard fields
    for (const model of IMAGE_MODELS) {
      try {
        const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            modalities: ["image", "text"],
          }),
        });

        if (!res.ok) {
          console.warn(`Model ${model}: HTTP ${res.status}`);
          continue;
        }

        const data = await res.json();
        const choice = data.choices?.[0];
        if (!choice?.message) continue;

        const msg = choice.message;

        // Format 1: images array on message (OpenRouter native)
        if (Array.isArray(msg.images)) {
          for (const img of msg.images) {
            const url = img.image_url?.url || img.url;
            if (url?.startsWith("data:")) {
              const m = url.match(/^data:([^;]+);base64,(.+)$/);
              if (m) {
                return NextResponse.json({ image: m[2], mimeType: m[1] });
              }
            }
          }
        }

        // Format 2: content is array with image parts
        if (Array.isArray(msg.content)) {
          for (const part of msg.content) {
            if (part.type === "image_url" && part.image_url?.url?.startsWith("data:")) {
              const m = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
              if (m) {
                return NextResponse.json({ image: m[2], mimeType: m[1] });
              }
            }
            if (part.type === "image" && part.source?.type === "base64") {
              return NextResponse.json({
                image: part.source.data,
                mimeType: part.source.media_type || "image/png",
              });
            }
          }
        }

        // Log full response structure for debugging
        const contentType = Array.isArray(msg.content) ? "array" : typeof msg.content;
        console.warn(`Model ${model}: no image found. content type: ${contentType}, has images: ${!!msg.images}, keys:`, Object.keys(msg));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`Model ${model} error:`, errMsg.substring(0, 200));
        continue;
      }
    }

    return NextResponse.json(
      { error: "All image generation models failed" },
      { status: 500 }
    );
  } catch (error) {
    console.error("Image generation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

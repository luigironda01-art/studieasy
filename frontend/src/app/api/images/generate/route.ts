import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

// Models to try in order (via OpenRouter)
const IMAGE_MODELS = [
  "google/gemini-2.5-flash-image",
  "google/gemini-3-pro-image-preview",
  "google/gemini-3.1-flash-image-preview",
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

    const openrouter = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    });

    const prompt = `Genera un'illustrazione chiara ed educativa per un documento di studio universitario.
L'immagine deve rappresentare: ${description}
Stile: Pulito, accademico, informativo. Adatto per un libro di testo o materiale di studio.
Usa etichette chiare se necessario. Qualità professionale.`;

    // Try each model until one works
    for (const model of IMAGE_MODELS) {
      try {
        const response = await openrouter.chat.completions.create({
          model,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          // @ts-expect-error OpenRouter supports responseModalities for image gen
          modalities: ["image", "text"],
        });

        // Extract image from response — cast to any since OpenRouter
        // returns extended format beyond OpenAI SDK types
        const choice = response.choices?.[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawMessage = choice?.message as any;
        if (!rawMessage?.content) continue;

        const content = rawMessage.content;

        // If content is a string, no image was generated
        if (typeof content === "string") {
          console.warn(`Model ${model}: text-only response`);
          continue;
        }

        // Content is array of parts (OpenRouter multimodal format)
        if (Array.isArray(content)) {
          for (const part of content) {
            // Check for inline image data
            if (
              part.type === "image_url" &&
              part.image_url?.url?.startsWith("data:")
            ) {
              const dataUrl = part.image_url.url;
              const base64Match = dataUrl.match(
                /^data:([^;]+);base64,(.+)$/
              );
              if (base64Match) {
                return NextResponse.json({
                  image: base64Match[2],
                  mimeType: base64Match[1],
                });
              }
            }
            // Some models return base64 directly in content
            if (
              part.type === "image" &&
              part.source?.type === "base64"
            ) {
              return NextResponse.json({
                image: part.source.data,
                mimeType: part.source.media_type || "image/png",
              });
            }
          }
        }

        console.warn(`Model ${model}: no image extracted from response`);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(`Model ${model} error:`, errMsg.substring(0, 200));
        continue;
      }
    }

    // All models failed — try raw fetch as fallback (Gemini native format)
    try {
      const googleKey = process.env.GOOGLE_AI_API_KEY;
      if (googleKey) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${googleKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
            }),
          }
        );
        if (res.ok) {
          const data = await res.json();
          const parts = data.candidates?.[0]?.content?.parts || [];
          const imagePart = parts.find(
            (p: { inlineData?: { data: string; mimeType: string } }) =>
              p.inlineData
          );
          if (imagePart?.inlineData) {
            return NextResponse.json({
              image: imagePart.inlineData.data,
              mimeType: imagePart.inlineData.mimeType || "image/png",
            });
          }
        }
      }
    } catch {
      // Google API fallback also failed
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

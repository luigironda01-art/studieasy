import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Try multiple Gemini model names for image generation
const IMAGE_MODELS = [
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.0-flash-exp",
  "imagen-3.0-generate-001",
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

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "No Google AI API key configured" },
        { status: 500 }
      );
    }

    const prompt = `Generate a clear, educational illustration or diagram for a study document.
The image should depict: ${description}
Style: Clean, academic, informative. Suitable for a textbook or study material.
Use clear labels if needed. Professional quality.`;

    // Try each model until one works
    for (const model of IMAGE_MODELS) {
      try {
        const isImagen = model.startsWith("imagen");

        const body = isImagen
          ? {
              instances: [{ prompt }],
              parameters: { sampleCount: 1 },
            }
          : {
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                responseModalities: ["IMAGE", "TEXT"],
              },
            };

        const endpoint = isImagen ? "predict" : "generateContent";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${endpoint}?key=${apiKey}`;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`Model ${model} failed:`, errText.substring(0, 200));
          continue; // Try next model
        }

        const data = await response.json();

        // Extract image from Gemini response
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

        // Imagen response format
        if (data.predictions?.[0]?.bytesBase64Encoded) {
          return NextResponse.json({
            image: data.predictions[0].bytesBase64Encoded,
            mimeType: "image/png",
          });
        }

        console.warn(`Model ${model}: no image in response`);
      } catch (err) {
        console.warn(`Model ${model} error:`, err);
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

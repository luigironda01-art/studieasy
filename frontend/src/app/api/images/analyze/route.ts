import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface ImageSuggestion {
  anchor: string;
  description: string;
  reason: "formula" | "diagram" | "structure" | "poor_text" | "table";
}

const MAX_IMAGES = 10;

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: "Missing text" }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "No OpenRouter API key configured" },
        { status: 500 }
      );
    }

    // Truncate to ~12k chars to stay within context limits and keep cost low
    const truncated = text.length > 12000 ? text.substring(0, 12000) : text;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
            content: `Sei un assistente che analizza testi di studio universitario. Il tuo compito è identificare al massimo ${MAX_IMAGES} sezioni del testo dove un'immagine generata migliorerebbe significativamente la comprensione.

Genera immagini SOLO per:
- Formule matematiche, fisiche o chimiche complesse che beneficerebbero di una rappresentazione visiva chiara
- Strutture molecolari, diagrammi di flusso, schemi concettuali
- Tabelle complesse che risultano illeggibili come testo
- Testo che descrive relazioni spaziali, processi o cicli che sarebbero più chiari come diagramma
- Contenuto mal formattato che risulterebbe brutto come testo nel PDF

NON generare immagini per:
- Testo semplice che si legge bene
- Elenchi puntati normali
- Definizioni o concetti puramente testuali
- Sezioni introduttive o conclusive

Rispondi SOLO con un JSON array. Ogni elemento deve avere:
- "anchor": una frase ESATTA dal testo (10-30 parole) che identifica dove inserire l'immagine
- "description": descrizione DETTAGLIATA dell'immagine da generare (stile educativo, professionale, con etichette chiare)
- "reason": uno tra "formula", "diagram", "structure", "poor_text", "table"

Se non ci sono sezioni che necessitano di immagini, rispondi con un array vuoto [].
Rispondi SOLO con il JSON, nessun altro testo.`,
          },
          {
            role: "user",
            content: truncated,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Analyze API error:", res.status, errText.substring(0, 200));
      return NextResponse.json(
        { error: `OpenRouter error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return NextResponse.json({ suggestions: [] });
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    try {
      const suggestions: ImageSuggestion[] = JSON.parse(jsonStr);

      // Validate and limit
      const valid = suggestions
        .filter(
          (s) =>
            s.anchor &&
            s.description &&
            s.reason &&
            typeof s.anchor === "string" &&
            typeof s.description === "string"
        )
        .slice(0, MAX_IMAGES);

      return NextResponse.json({ suggestions: valid });
    } catch {
      console.warn("Failed to parse AI suggestions:", jsonStr.substring(0, 200));
      return NextResponse.json({ suggestions: [] });
    }
  } catch (error) {
    console.error("Image analyze error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

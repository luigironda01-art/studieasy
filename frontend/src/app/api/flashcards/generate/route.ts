import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log("=== Flashcard Generation API Called ===");
  console.log("SERVICE_ROLE_KEY present:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);
  console.log("SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);

  // Initialize clients inside the function to ensure fresh env vars
  const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
  });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    const { chapterId, userId, numCards = 10, difficulty = "medium", language = "it" } = await request.json();
    console.log("Request data:", { chapterId, userId, numCards, difficulty, language });

    if (!chapterId || !userId) {
      console.log("Missing required fields");
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get chapter with processed text
    console.log("Fetching chapter:", chapterId);
    const { data: chapter, error: chapterError } = await supabase
      .from("chapters")
      .select("*")
      .eq("id", chapterId)
      .single();

    console.log("Chapter fetch result:", { chapter: !!chapter, error: chapterError });

    if (chapterError || !chapter) {
      console.log("Chapter not found or error:", chapterError);
      return NextResponse.json(
        { error: "Chapter not found", details: chapterError?.message },
        { status: 404 }
      );
    }

    if (!chapter.processed_text) {
      return NextResponse.json(
        { error: "Chapter has not been processed yet" },
        { status: 400 }
      );
    }

    // Generate flashcards using Claude via OpenRouter
    const langName = language === "it" ? "Italiano" : "English";

    const prompt = `Sei un esperto educatore e tutor. Il tuo compito è creare flashcard efficaci per aiutare gli studenti a memorizzare e comprendere i concetti chiave.

Genera esattamente ${numCards} flashcard dal seguente testo.

REGOLE:
1. Ogni flashcard deve avere:
   - "front": Una domanda chiara, specifica e che stimola il pensiero
   - "back": Una risposta concisa ma completa

2. Le domande devono:
   - Testare la comprensione, non solo la memorizzazione
   - Essere specifiche (evita domande vaghe)
   - Coprire i concetti più importanti del testo

3. Le risposte devono:
   - Essere complete ma concise
   - Contenere solo informazioni presenti nel testo
   - Essere facili da verificare

4. Difficoltà: ${difficulty}
   - easy: Definizioni e fatti base
   - medium: Comprensione e applicazione
   - hard: Analisi e connessioni tra concetti

5. Lingua: ${langName}

TESTO DA ANALIZZARE:
${chapter.processed_text}

Rispondi SOLO con un array JSON valido, senza altri commenti:
[
  {"front": "domanda 1", "back": "risposta 1"},
  {"front": "domanda 2", "back": "risposta 2"}
]`;

    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-3.5-sonnet",
      max_tokens: 4096,
      messages: [
        { role: "user", content: prompt }
      ],
    });

    let responseText = response.choices[0]?.message?.content || "[]";

    // Clean up potential markdown code blocks
    if (responseText.includes("```json")) {
      responseText = responseText.split("```json")[1].split("```")[0];
    } else if (responseText.includes("```")) {
      responseText = responseText.split("```")[1].split("```")[0];
    }

    const flashcards = JSON.parse(responseText.trim());

    // Generate batch_id for this generation session
    const batchId = crypto.randomUUID();

    // Save flashcards to database
    let createdCount = 0;
    for (const card of flashcards) {
      // Insert flashcard with difficulty and batch_id
      const { data: flashcardData, error: flashcardError } = await supabase
        .from("flashcards")
        .insert({
          chapter_id: chapterId,
          user_id: userId,
          front: card.front,
          back: card.back,
          ai_generated: true,
          difficulty: difficulty,
          batch_id: batchId
        })
        .select()
        .single();

      if (flashcardData && !flashcardError) {
        // Create initial FSRS review state
        const now = new Date().toISOString();
        await supabase
          .from("reviews")
          .insert({
            flashcard_id: flashcardData.id,
            user_id: userId,
            difficulty: 0,
            stability: 0,
            retrievability: 1,
            elapsed_days: 0,
            scheduled_days: 0,
            reps: 0,
            lapses: 0,
            state: 0, // New
            due: now,
            last_review: null
          });

        createdCount++;
      }
    }

    return NextResponse.json({
      success: true,
      flashcards_created: createdCount,
      batch_id: batchId,
      difficulty: difficulty,
      message: `Generated ${createdCount} flashcards successfully`
    });
  } catch (error) {
    console.error("Flashcard generation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { logUsage, estimateTokens } from "@/lib/usage-logger";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log("=== Summary Generation API Called ===");

  const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
  });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    const {
      chapterId,
      userId,
      targetWords = 500,
      language = "it"
    } = await request.json();

    console.log("Request data:", { chapterId, userId, targetWords, language });

    if (!chapterId || !userId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get chapter with processed text
    const { data: chapter, error: chapterError } = await supabase
      .from("chapters")
      .select("*")
      .eq("id", chapterId)
      .single();

    if (chapterError || !chapter) {
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

    // Check if summary already exists for this chapter
    const { data: existingSummary } = await supabase
      .from("summaries")
      .select("id")
      .eq("chapter_id", chapterId)
      .eq("user_id", userId)
      .single();

    if (existingSummary) {
      // Delete existing summary to regenerate
      await supabase
        .from("summaries")
        .delete()
        .eq("id", existingSummary.id);
    }

    const langName = language === "it" ? "Italiano" : "English";

    const prompt = `Sei un esperto di sintesi e didattica. Il tuo compito è creare un riassunto chiaro, completo e ben strutturato.

ISTRUZIONI:
1. Scrivi un riassunto di circa ${targetWords} parole (±10%)
2. Usa un linguaggio chiaro e accessibile
3. Mantieni tutti i concetti chiave e le informazioni importanti
4. **IMPORTANTE**: Dividi il riassunto in SEZIONI ben definite con titoli
5. Usa elenchi puntati dove appropriato per migliorare la leggibilità
6. Lingua: ${langName}

FORMATO OUTPUT OBBLIGATORIO:
- Usa ## per i titoli delle sezioni principali (es: ## Introduzione, ## Concetti Chiave)
- Usa ### per i sotto-titoli se necessario
- Ogni sezione deve avere un titolo descrittivo che aiuti lo studente a navigare
- Usa **grassetto** per i concetti chiave all'interno del testo
- Usa elenchi puntati (- ) per liste di concetti
- NON iniziare con "Riassunto:" o titoli generici simili
- Inizia direttamente con la prima sezione

ESEMPIO DI STRUTTURA:
## Concetto Principale
Spiegazione del concetto...

## Elementi Fondamentali
- Primo elemento
- Secondo elemento

## Applicazioni Pratiche
Descrizione delle applicazioni...

TESTO DA RIASSUMERE:
${chapter.processed_text}

Scrivi il riassunto strutturato:`;

    console.log("Generating summary with AI...");
    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-3.5-sonnet",
      max_tokens: 2048,
      messages: [
        { role: "user", content: prompt }
      ],
    });

    const summaryContent = response.choices[0]?.message?.content || "";

    // Count words
    const wordCount = summaryContent.trim().split(/\s+/).length;

    console.log(`Generated summary with ${wordCount} words`);

    // Save summary to database
    const { data: summary, error: summaryError } = await supabase
      .from("summaries")
      .insert({
        chapter_id: chapterId,
        user_id: userId,
        content: summaryContent,
        word_count: wordCount,
        target_words: targetWords
      })
      .select()
      .single();

    if (summaryError || !summary) {
      console.error("Summary save error:", summaryError);
      return NextResponse.json(
        { error: "Failed to save summary", details: summaryError?.message },
        { status: 500 }
      );
    }

    console.log(`Created summary ${summary.id}`);

    // Log usage analytics
    const durationMs = Date.now() - startTime;
    const tokensInput = response.usage?.prompt_tokens || estimateTokens(prompt);
    const tokensOutput = response.usage?.completion_tokens || estimateTokens(summaryContent);

    await logUsage({
      userId,
      actionType: "generate_summary",
      chapterId,
      tokensInput,
      tokensOutput,
      modelUsed: "anthropic/claude-3.5-sonnet",
      itemsGenerated: wordCount, // Using word count as "items"
      durationMs,
      status: "success",
    });

    return NextResponse.json({
      success: true,
      summary_id: summary.id,
      word_count: wordCount,
      message: `Riassunto generato con ${wordCount} parole`
    });

  } catch (error) {
    console.error("Summary generation error:", error);

    // Log error
    const durationMs = Date.now() - startTime;
    await logUsage({
      userId: "unknown",
      actionType: "generate_summary",
      durationMs,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Generation failed",
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    );
  }
}

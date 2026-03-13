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
    const body = await request.json();
    const {
      chapterId,
      userId,
      targetWords,
      maxWords,
      length = "medium",
      language = "it"
    } = body;

    // Support both targetWords and maxWords for backward compatibility
    const wordTarget = targetWords || maxWords || 500;

    console.log("Request data:", { chapterId, userId, wordTarget, length, language });

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

    // Adjust instructions based on length/detail level
    const lengthInstructions: Record<string, string> = {
      short: "Concentrati SOLO sui punti chiave essenziali. Sii molto conciso e sintetico.",
      medium: "Bilancia sintesi e dettaglio. Includi i concetti principali con spiegazioni moderate.",
      detailed: "Sii approfondito e esaustivo. Includi dettagli, esempi e spiegazioni complete."
    };

    const lengthDesc = lengthInstructions[length] || lengthInstructions.medium;

    const prompt = `Sei un esperto di sintesi e didattica. Il tuo compito è creare un riassunto chiaro, completo e ben strutturato.

ISTRUZIONI:
1. Scrivi un riassunto di circa ${wordTarget} parole (±10%)
2. STILE: ${lengthDesc}
3. Usa un linguaggio chiaro e accessibile
4. **CRITICO**: Il riassunto DEVE coprire TUTTO il contenuto del documento, dall'inizio alla fine. NON fermarti a metà. Ogni argomento e sezione del testo originale deve essere rappresentata nel riassunto.
5. **IMPORTANTE**: Dividi il riassunto in SEZIONI ben definite con titoli che rispecchiano la struttura del documento
6. Usa elenchi puntati dove appropriato per migliorare la leggibilità
7. Lingua: ${langName}

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

    // Use smart model selection if available, fallback to Claude
    const modelToUse = chapter.preferred_model || "anthropic/claude-3.5-sonnet";
    console.log("Generating summary with model:", modelToUse);

    // Scale max_tokens based on target word count (roughly 1.5 tokens per word + buffer)
    const maxTokens = Math.max(4096, Math.ceil(wordTarget * 3));

    const response = await openrouter.chat.completions.create({
      model: modelToUse,
      max_tokens: maxTokens,
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
        target_words: wordTarget
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
      modelUsed: modelToUse,
      itemsGenerated: wordCount, // Using word count as "items"
      durationMs,
      status: "success",
    });

    return NextResponse.json({
      success: true,
      summary_id: summary.id,
      summary: summaryContent,
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

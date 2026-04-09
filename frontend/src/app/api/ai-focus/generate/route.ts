import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { logUsage, estimateTokens } from "@/lib/usage-logger";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log("=== AI Focus Generation API Called ===");

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
      language = "it"
    } = await request.json();

    console.log("Request data:", { chapterId, userId, language });

    if (!chapterId || !userId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get chapter with processed text
    const { data: chapter, error: chapterError } = await supabase
      .from("chapters")
      .select("*, sources(title)")
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

    const langName = language === "it" ? "Italiano" : "English";
    const sampleText = chapter.processed_text.slice(0, 4000);

    const prompt = `Sei un tutor esperto. Analizza questo materiale di studio e suggerisci risorse per approfondire.

MATERIALE:
${sampleText}

COMPITI:
1. Identifica l'argomento principale e i sotto-argomenti chiave
2. Individua concetti che potrebbero beneficiare di approfondimento
3. Suggerisci 5-8 query di ricerca specifiche per trovare:
   - Video tutorial correlati (YouTube, Khan Academy)
   - Articoli accademici o divulgativi
   - Spiegazioni alternative con diversi approcci
   - Esempi pratici e applicazioni reali
   - Risorse gratuite online

LINGUA: ${langName}

Rispondi in JSON con questo formato esatto:
{
  "main_topic": "Argomento principale",
  "subtopics": ["sotto-argomento 1", "sotto-argomento 2", "sotto-argomento 3"],
  "concepts_to_explore": [
    {"concept": "concetto importante", "why": "perche serve approfondire"}
  ],
  "search_queries": [
    {"query": "query di ricerca specifica", "purpose": "cosa troverai con questa ricerca", "type": "video"},
    {"query": "altra query", "purpose": "descrizione", "type": "article"},
    {"query": "altra query", "purpose": "descrizione", "type": "tutorial"}
  ],
  "study_tips": ["suggerimento pratico 1", "suggerimento pratico 2", "suggerimento pratico 3"]
}`;

    // Use smart model selection if available, fallback to Claude
    const modelToUse = chapter.preferred_model || "anthropic/claude-sonnet-4";
    console.log("Generating AI Focus with model:", modelToUse);

    const response = await openrouter.chat.completions.create({
      model: modelToUse,
      max_tokens: 2048,
      messages: [
        { role: "user", content: prompt }
      ],
    });

    let responseText = response.choices[0]?.message?.content || "{}";

    // Clean up markdown code blocks
    if (responseText.includes("```json")) {
      responseText = responseText.split("```json")[1].split("```")[0];
    } else if (responseText.includes("```")) {
      responseText = responseText.split("```")[1].split("```")[0];
    }

    const focusData = JSON.parse(responseText.trim());

    console.log(`Generated AI Focus for topic: ${focusData.main_topic}`);

    // Log usage analytics
    const durationMs = Date.now() - startTime;
    const tokensInput = response.usage?.prompt_tokens || estimateTokens(prompt);
    const tokensOutput = response.usage?.completion_tokens || estimateTokens(responseText);

    await logUsage({
      userId,
      actionType: "generate_ai_focus",
      chapterId,
      tokensInput,
      tokensOutput,
      modelUsed: modelToUse,
      itemsGenerated: focusData.search_queries?.length || 0,
      durationMs,
      status: "success",
    });

    return NextResponse.json({
      success: true,
      focus: focusData,
      chapter_title: chapter.title,
      source_title: chapter.sources?.title,
      message: "AI Focus generato con successo"
    });

  } catch (error) {
    console.error("AI Focus generation error:", error);

    // Log error
    const durationMs = Date.now() - startTime;
    await logUsage({
      userId: "unknown",
      actionType: "generate_ai_focus",
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

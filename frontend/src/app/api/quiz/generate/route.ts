import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { logUsage, estimateTokens } from "@/lib/usage-logger";
import { trackGeneration, updateGeneration } from "@/lib/generations";
import { validateUserId } from "@/lib/auth-server";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log("=== Quiz Generation API Called ===");

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
      userId: bodyUserId,
      numQuestions = 10,
      difficulty = "medium",
      language = "it",
      includeTrueFalse = true,
    } = await request.json();

    if (!chapterId) {
      return NextResponse.json({ error: "Missing chapterId" }, { status: 400 });
    }
    const { userId, error: authError } = await validateUserId(request, bodyUserId);
    if (!userId) {
      return NextResponse.json({ error: authError || "Unauthorized" }, { status: 401 });
    }

    console.log("Request data:", { chapterId, userId, numQuestions, difficulty, language });

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

    const genId = await trackGeneration(userId, chapter.source_id, "quiz", chapterId);

    // Calculate question distribution
    let multipleChoiceCount: number;
    let trueFalseCount: number;
    let openEndedCount: number;

    if (includeTrueFalse) {
      multipleChoiceCount = Math.ceil(numQuestions * 0.6);
      trueFalseCount = Math.ceil(numQuestions * 0.2);
      openEndedCount = numQuestions - multipleChoiceCount - trueFalseCount;
    } else {
      multipleChoiceCount = Math.ceil(numQuestions * 0.75);
      trueFalseCount = 0;
      openEndedCount = numQuestions - multipleChoiceCount;
    }

    const langName = language === "it" ? "Italiano" : "English";

    const prompt = `Sei un esperto educatore. Crea un quiz basato sul seguente testo.

GENERA ESATTAMENTE:
- ${multipleChoiceCount} domande a SCELTA MULTIPLA (4 opzioni, 1 corretta)${
      trueFalseCount > 0 ? `\n- ${trueFalseCount} domande VERO/FALSO` : ""
    }
- ${openEndedCount} domande a RISPOSTA APERTA (breve)

REGOLE:
1. Le domande devono testare la comprensione del testo
2. Difficolta: ${difficulty}
3. Lingua: ${langName}
4. Le spiegazioni devono essere concise

FORMATO JSON RICHIESTO:
[
  {
    "type": "multiple_choice",
    "question": "Domanda?",
    "options": ["Opzione A", "Opzione B", "Opzione C", "Opzione D"],
    "correct_answer": "Opzione A",
    "explanation": "Spiegazione breve"
  },
  {
    "type": "true_false",
    "question": "Affermazione da valutare come vera o falsa",
    "options": ["Vero", "Falso"],
    "correct_answer": "Vero",
    "explanation": "Spiegazione breve"
  },
  {
    "type": "open_ended",
    "question": "Domanda aperta?",
    "options": null,
    "correct_answer": "Risposta attesa sintetica",
    "explanation": "Criteri di valutazione"
  }
]

TESTO DA ANALIZZARE:
${chapter.processed_text}

Rispondi SOLO con un array JSON valido, senza altri commenti:`;

    // Use smart model selection if available, fallback to Claude
    const modelToUse = chapter.preferred_model || "anthropic/claude-3.5-sonnet";
    console.log("Generating quiz with model:", modelToUse);

    const response = await openrouter.chat.completions.create({
      model: modelToUse,
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

    const questions = JSON.parse(responseText.trim());
    console.log(`Generated ${questions.length} questions`);

    // Create quiz record with difficulty
    const { data: quiz, error: quizError } = await supabase
      .from("quizzes")
      .insert({
        chapter_id: chapterId,
        user_id: userId,
        title: `Quiz - ${chapter.title}`,
        total_questions: questions.length,
        score: 0,
        difficulty: difficulty
      })
      .select()
      .single();

    if (quizError || !quiz) {
      console.error("Quiz creation error:", quizError);
      return NextResponse.json(
        { error: "Failed to create quiz", details: quizError?.message },
        { status: 500 }
      );
    }

    // Insert questions
    let createdCount = 0;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const { error: questionError } = await supabase
        .from("quiz_questions")
        .insert({
          quiz_id: quiz.id,
          question_type: q.type,
          question: q.question,
          options: q.options,
          correct_answer: q.correct_answer,
          explanation: q.explanation,
          order_index: i
        });

      if (!questionError) {
        createdCount++;
      } else {
        console.error("Question insert error:", questionError);
      }
    }

    console.log(`Created quiz ${quiz.id} with ${createdCount} questions`);

    // Log usage analytics
    const durationMs = Date.now() - startTime;
    const tokensInput = response.usage?.prompt_tokens || estimateTokens(prompt);
    const tokensOutput = response.usage?.completion_tokens || estimateTokens(responseText);

    await logUsage({
      userId,
      actionType: "generate_quiz",
      chapterId,
      tokensInput,
      tokensOutput,
      modelUsed: modelToUse,
      itemsGenerated: createdCount,
      difficulty,
      durationMs,
      status: "success",
    });

    if (genId) await updateGeneration(genId, { status: "completed", progress: 100, result_url: `/dashboard/source/${chapter.source_id}/quiz` });

    return NextResponse.json({
      success: true,
      quiz_id: quiz.id,
      questions_created: createdCount,
      difficulty: difficulty,
      message: `Quiz generato con ${createdCount} domande`
    });

  } catch (error) {
    console.error("Quiz generation error:", error);

    // Log error
    const durationMs = Date.now() - startTime;
    await logUsage({
      userId: "unknown",
      actionType: "generate_quiz",
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

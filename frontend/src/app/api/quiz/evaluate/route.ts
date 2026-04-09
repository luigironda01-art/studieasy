import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  console.log("=== Quiz Answer Evaluation API Called ===");

  const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
  });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    const { questionId, userAnswer, language = "it" } = await request.json();

    if (!questionId || !userAnswer) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get question details
    const { data: question, error: questionError } = await supabase
      .from("quiz_questions")
      .select("*")
      .eq("id", questionId)
      .single();

    if (questionError || !question) {
      return NextResponse.json(
        { error: "Question not found" },
        { status: 404 }
      );
    }

    // For multiple choice and true/false, simple comparison
    if (question.question_type !== "open_ended") {
      const isCorrect = userAnswer.trim().toLowerCase() === question.correct_answer.trim().toLowerCase();

      await supabase
        .from("quiz_questions")
        .update({
          user_answer: userAnswer,
          is_correct: isCorrect,
          answered_at: new Date().toISOString()
        })
        .eq("id", questionId);

      return NextResponse.json({
        is_correct: isCorrect,
        correct_answer: question.correct_answer,
        explanation: question.explanation
      });
    }

    // For open-ended questions, use AI evaluation
    const langName = language === "it" ? "Italiano" : "English";

    const prompt = `Valuta la risposta dello studente a questa domanda.

DOMANDA: ${question.question}

RISPOSTA ATTESA: ${question.correct_answer}

RISPOSTA STUDENTE: ${userAnswer}

Valuta se la risposta e' sostanzialmente corretta. Considera:
- Il concetto chiave e' presente?
- La risposta dimostra comprensione?
- Piccole imprecisioni sono accettabili se il concetto e' corretto

Rispondi SOLO con questo JSON:
{
  "is_correct": true/false,
  "score": 0-100,
  "feedback": "Breve feedback in ${langName} (max 2 frasi)"
}`;

    const response = await openrouter.chat.completions.create({
      model: "anthropic/claude-3-5-sonnet-20241022",
      max_tokens: 500,
      messages: [
        { role: "user", content: prompt }
      ],
    });

    let responseText = response.choices[0]?.message?.content || "{}";

    // Clean up potential markdown
    if (responseText.includes("```json")) {
      responseText = responseText.split("```json")[1].split("```")[0];
    } else if (responseText.includes("```")) {
      responseText = responseText.split("```")[1].split("```")[0];
    }

    const evaluation = JSON.parse(responseText.trim());

    // Update question with evaluation
    await supabase
      .from("quiz_questions")
      .update({
        user_answer: userAnswer,
        is_correct: evaluation.is_correct,
        ai_feedback: evaluation.feedback,
        answered_at: new Date().toISOString()
      })
      .eq("id", questionId);

    return NextResponse.json({
      is_correct: evaluation.is_correct,
      score: evaluation.score,
      feedback: evaluation.feedback,
      correct_answer: question.correct_answer,
      explanation: question.explanation
    });

  } catch (error) {
    console.error("Evaluation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Evaluation failed" },
      { status: 500 }
    );
  }
}

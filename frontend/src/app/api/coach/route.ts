import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { validateUserId } from "@/lib/auth-server";

function getClients() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const openrouter = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
  });
  return { supabase, openrouter };
}

interface ChapterStats {
  chapterId: string;
  chapterTitle: string;
  sourceTitle: string;
  sourceId: string;
  dueCards: number;
  totalCards: number;
  avgDifficulty: number;
  lastQuizScore: number | null;
  summaryRating: number | null;
  lapses: number;
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, openrouter } = getClients();
    const { userId: bodyUserId } = await request.json();

    const { userId, error: authError } = await validateUserId(request, bodyUserId);
    if (!userId) {
      return new Response(JSON.stringify({ error: authError || "Unauthorized" }), { status: 401 });
    }

    // 1. Fetch all user's flashcard review data
    const { data: reviews } = await supabase
      .from("reviews")
      .select("flashcard_id, difficulty, stability, lapses, state, due, reps")
      .eq("user_id", userId);

    // 2. Fetch flashcards to map to chapters
    const { data: flashcards } = await supabase
      .from("flashcards")
      .select("id, chapter_id")
      .eq("user_id", userId);

    // 3. Fetch chapters with sources
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id, title, source_id, processing_status")
      .eq("processing_status", "completed");

    // 4. Fetch sources
    const { data: sources } = await supabase
      .from("sources")
      .select("id, title")
      .eq("user_id", userId);

    // 5. Fetch latest quiz scores per chapter
    const { data: quizzes } = await supabase
      .from("quizzes")
      .select("chapter_id, score, total_questions, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    // 6. Fetch summary feedback
    const { data: feedback } = await supabase
      .from("study_feedback")
      .select("chapter_id, rating, feedback_type, created_at")
      .eq("user_id", userId)
      .eq("feedback_type", "summary_rating")
      .order("created_at", { ascending: false });

    // Build maps
    const flashcardMap = new Map(
      (flashcards || []).map((f: { id: string; chapter_id: string }) => [f.id, f.chapter_id])
    );
    const sourceMap = new Map(
      (sources || []).map((s: { id: string; title: string }) => [s.id, s.title])
    );
    const chapterMap = new Map(
      (chapters || []).map((c: { id: string; title: string; source_id: string }) => [c.id, c])
    );

    // Latest quiz score per chapter
    const quizScoreMap = new Map<string, number>();
    for (const q of quizzes || []) {
      if (!quizScoreMap.has(q.chapter_id)) {
        quizScoreMap.set(q.chapter_id, Math.round((q.score / q.total_questions) * 100));
      }
    }

    // Latest summary rating per chapter
    const feedbackMap = new Map<string, number>();
    for (const f of feedback || []) {
      if (!feedbackMap.has(f.chapter_id)) {
        feedbackMap.set(f.chapter_id, f.rating);
      }
    }

    // Aggregate per chapter
    const now = new Date();
    const chapterStats = new Map<string, ChapterStats>();

    for (const review of reviews || []) {
      const chapterId = flashcardMap.get(review.flashcard_id);
      if (!chapterId) continue;

      const chapter = chapterMap.get(chapterId);
      if (!chapter) continue;

      if (!chapterStats.has(chapterId)) {
        chapterStats.set(chapterId, {
          chapterId,
          chapterTitle: chapter.title,
          sourceTitle: sourceMap.get(chapter.source_id) || "Sconosciuto",
          sourceId: chapter.source_id,
          dueCards: 0,
          totalCards: 0,
          avgDifficulty: 0,
          lastQuizScore: quizScoreMap.get(chapterId) ?? null,
          summaryRating: feedbackMap.get(chapterId) ?? null,
          lapses: 0,
        });
      }

      const stats = chapterStats.get(chapterId)!;
      stats.totalCards++;
      stats.avgDifficulty += review.difficulty || 0;
      stats.lapses += review.lapses || 0;

      if (new Date(review.due) <= now) {
        stats.dueCards++;
      }
    }

    // Finalize averages
    for (const stats of Array.from(chapterStats.values())) {
      if (stats.totalCards > 0) {
        stats.avgDifficulty = Math.round((stats.avgDifficulty / stats.totalCards) * 10) / 10;
      }
    }

    const statsArray = Array.from(chapterStats.values());
    const totalDue = statsArray.reduce((acc, s) => acc + s.dueCards, 0);

    // If no data at all, return default suggestion
    if (statsArray.length === 0) {
      return new Response(JSON.stringify({
        suggestion: {
          message: "Inizia caricando un libro e generando le tue prime flashcard. Il coach ti guiderà nel tuo percorso di studio!",
          actions: [],
          priority: "start",
        },
      }));
    }

    // 7. Ask AI to generate personalized suggestion
    const statsPrompt = statsArray
      .sort((a, b) => b.dueCards - a.dueCards || b.lapses - a.lapses)
      .slice(0, 10)
      .map(s =>
        `- "${s.chapterTitle}" (${s.sourceTitle}): ${s.dueCards} carte scadute su ${s.totalCards}, difficoltà media ${s.avgDifficulty}/10, ${s.lapses} errori totali${s.lastQuizScore !== null ? `, ultimo quiz: ${s.lastQuizScore}%` : ""}${s.summaryRating !== null ? `, comprensione riassunto: ${s.summaryRating}/3` : ""}`
      )
      .join("\n");

    const aiResponse = await openrouter.chat.completions.create({
      model: "anthropic/claude-3.5-sonnet",
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: `Sei un coach di studio. Analizza i dati dello studente e dai UN suggerimento conciso e motivante per la sessione di oggi. Rispondi in JSON con questo formato:
{
  "message": "messaggio motivante e specifico (max 2 frasi)",
  "actions": [
    { "label": "testo bottone", "type": "flashcards|quiz|summary", "chapterId": "id", "chapterTitle": "nome" }
  ],
  "insight": "una frase breve su un pattern che hai notato"
}
Max 3 azioni. Sii specifico sui capitoli. Parla in italiano.`,
        },
        {
          role: "user",
          content: `Carte totali in scadenza: ${totalDue}\n\nStatistiche per capitolo:\n${statsPrompt}`,
        },
      ],
    });

    const aiText = aiResponse.choices[0]?.message?.content || "";
    let suggestion;
    try {
      // Extract JSON from response
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      suggestion = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      suggestion = null;
    }

    // Fallback if AI parsing fails
    if (!suggestion) {
      const topChapter = statsArray.sort((a, b) => b.dueCards - a.dueCards)[0];
      suggestion = {
        message: `Hai ${totalDue} carte da ripassare. Concentrati su "${topChapter.chapterTitle}" che ha ${topChapter.dueCards} carte in scadenza.`,
        actions: [
          {
            label: `Ripassa ${topChapter.chapterTitle}`,
            type: "flashcards",
            chapterId: topChapter.chapterId,
            chapterTitle: topChapter.chapterTitle,
          },
        ],
        insight: topChapter.lapses > 5
          ? "Questo capitolo ha molti errori ripetuti — rileggi il riassunto prima di ripassare."
          : "Stai andando bene, continua così!",
      };
    }

    return new Response(JSON.stringify({
      suggestion,
      stats: {
        totalDue,
        totalCards: statsArray.reduce((a, s) => a + s.totalCards, 0),
        chapters: statsArray.length,
      },
    }));
  } catch (error) {
    console.error("Coach API error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 });
  }
}

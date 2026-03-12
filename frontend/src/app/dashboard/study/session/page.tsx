"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Flashcard, Review } from "@/lib/supabase";
import Link from "next/link";

interface FlashcardWithReview extends Flashcard {
  review: Review;
  chapterTitle?: string;
  sourceTitle?: string;
}

type Rating = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

interface FSRSParams {
  w: number[];
}

const DEFAULT_PARAMS: FSRSParams = {
  w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61],
};

export default function StudySessionPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chapterId = searchParams.get("chapter");

  const [cards, setCards] = useState<FlashcardWithReview[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionStats, setSessionStats] = useState({
    total: 0,
    reviewed: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
  });

  useBreadcrumb([
    { label: "Studia", href: "/dashboard/study" },
    { label: "Sessione" },
  ]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      fetchDueCards();
    }
  }, [user, chapterId]);

  const fetchDueCards = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const now = new Date().toISOString();

      let query = supabase
        .from("reviews")
        .select(`
          *,
          flashcards!inner (
            *,
            chapters!inner (
              title,
              sources!inner (
                title
              )
            )
          )
        `)
        .eq("user_id", user.id)
        .lte("due", now)
        .order("due", { ascending: true });

      if (chapterId) {
        query = query.eq("flashcards.chapter_id", chapterId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedCards: FlashcardWithReview[] = (data || []).map((r: any) => ({
        ...r.flashcards,
        review: {
          id: r.id,
          flashcard_id: r.flashcard_id,
          user_id: r.user_id,
          difficulty: r.difficulty,
          stability: r.stability,
          retrievability: r.retrievability,
          elapsed_days: r.elapsed_days,
          scheduled_days: r.scheduled_days,
          reps: r.reps,
          lapses: r.lapses,
          state: r.state,
          due: r.due,
          last_review: r.last_review,
          created_at: r.created_at,
          updated_at: r.updated_at,
        },
        chapterTitle: r.flashcards.chapters?.title,
        sourceTitle: r.flashcards.chapters?.sources?.title,
      }));

      setCards(formattedCards);
      setSessionStats(prev => ({ ...prev, total: formattedCards.length }));
      setCurrentIndex(0);
      setIsFlipped(false);
      setSessionComplete(formattedCards.length === 0);
    } catch (error) {
      console.error("Error fetching cards:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // FSRS Algorithm implementation
  const calculateNextReview = useCallback((review: Review, rating: Rating): Partial<Review> => {
    const w = DEFAULT_PARAMS.w;
    const now = new Date();

    let newDifficulty = review.difficulty;
    let newStability = review.stability;
    let newState = review.state;
    let newLapses = review.lapses;
    let newReps = review.reps + 1;

    if (review.state === 0) {
      // New card
      newDifficulty = Math.max(1, Math.min(10, w[4] - (rating - 3) * w[5]));
      newStability = w[rating - 1];
      newState = rating === 1 ? 1 : 2;
    } else if (review.state === 1 || review.state === 3) {
      // Learning or Relearning
      if (rating === 1) {
        newState = 1;
        newStability = Math.max(0.1, review.stability * 0.5);
        newLapses = review.lapses + 1;
      } else if (rating === 2) {
        newState = 1;
        newStability = review.stability;
      } else {
        newState = 2;
        newStability = review.stability * (1 + (rating - 2) * 0.5);
      }
    } else {
      // Review state
      const elapsedDays = review.last_review
        ? Math.max(0, (now.getTime() - new Date(review.last_review).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      const retrievability = Math.pow(1 + elapsedDays / (9 * review.stability), -1);

      if (rating === 1) {
        newState = 3; // Relearning
        newStability = Math.max(0.1, review.stability * w[11]);
        newLapses = review.lapses + 1;
        newDifficulty = Math.min(10, review.difficulty + w[6]);
      } else {
        const difficultyFactor = Math.exp(w[7] * (rating - 3));
        const stabilityFactor = Math.exp(w[8]) * (11 - review.difficulty) * Math.pow(review.stability, -w[9]);
        const retrievabilityFactor = Math.exp(w[10] * (1 - retrievability));

        newStability = review.stability * (1 + difficultyFactor * stabilityFactor * retrievabilityFactor);

        if (rating === 2) {
          newDifficulty = Math.min(10, review.difficulty + w[15]);
        } else if (rating === 4) {
          newDifficulty = Math.max(1, review.difficulty - w[14]);
        }
      }
    }

    // Calculate next due date based on stability
    let intervalDays: number;
    if (newState === 1) {
      intervalDays = rating === 1 ? 1 / 1440 : 10 / 1440; // Minutes converted to days
    } else if (newState === 3) {
      intervalDays = 10 / 1440;
    } else {
      intervalDays = Math.max(1, Math.round(newStability * 0.9));
    }

    const nextDue = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000);

    return {
      difficulty: newDifficulty,
      stability: newStability,
      state: newState,
      lapses: newLapses,
      reps: newReps,
      scheduled_days: Math.round(intervalDays),
      elapsed_days: review.last_review
        ? Math.round((now.getTime() - new Date(review.last_review).getTime()) / (1000 * 60 * 60 * 24))
        : 0,
      last_review: now.toISOString(),
      due: nextDue.toISOString(),
    };
  }, []);

  const handleRating = async (rating: Rating) => {
    if (!user || currentIndex >= cards.length) return;

    const currentCard = cards[currentIndex];
    const updates = calculateNextReview(currentCard.review, rating);

    try {
      const { error } = await supabase
        .from("reviews")
        .update(updates)
        .eq("id", currentCard.review.id);

      if (error) throw error;

      // Update session stats
      setSessionStats(prev => ({
        ...prev,
        reviewed: prev.reviewed + 1,
        again: rating === 1 ? prev.again + 1 : prev.again,
        hard: rating === 2 ? prev.hard + 1 : prev.hard,
        good: rating === 3 ? prev.good + 1 : prev.good,
        easy: rating === 4 ? prev.easy + 1 : prev.easy,
      }));

      // Move to next card
      if (currentIndex + 1 >= cards.length) {
        setSessionComplete(true);
      } else {
        setCurrentIndex(prev => prev + 1);
        setIsFlipped(false);
      }
    } catch (error) {
      console.error("Error updating review:", error);
    }
  };

  const handleKeyPress = useCallback((e: KeyboardEvent) => {
    if (sessionComplete) return;

    if (e.code === "Space" && !isFlipped) {
      e.preventDefault();
      setIsFlipped(true);
    } else if (isFlipped) {
      switch (e.key) {
        case "1":
          handleRating(1);
          break;
        case "2":
          handleRating(2);
          break;
        case "3":
          handleRating(3);
          break;
        case "4":
          handleRating(4);
          break;
      }
    }
  }, [isFlipped, sessionComplete, handleRating]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [handleKeyPress]);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-6 text-slate-400">Caricamento sessione...</p>
        </div>
      </div>
    );
  }

  // No cards due
  if (cards.length === 0 && !sessionComplete) {
    return (
      <div className="flex items-center justify-center min-h-[80vh] p-6">
        <div className="text-center max-w-md">
          <div className="w-24 h-24 bg-green-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-green-500/30">
            <span className="text-5xl">🎉</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Tutto fatto!</h2>
          <p className="text-slate-400 mb-8">
            Non hai carte da ripassare {chapterId ? "in questo capitolo" : ""} per ora.
            Torna più tardi per mantenere la memoria fresca.
          </p>
          <Link
            href="/dashboard/study"
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 border border-slate-700 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors"
          >
            ← Torna allo Study Hub
          </Link>
        </div>
      </div>
    );
  }

  // Session complete
  if (sessionComplete) {
    const accuracy = sessionStats.reviewed > 0
      ? Math.round(((sessionStats.good + sessionStats.easy) / sessionStats.reviewed) * 100)
      : 0;

    return (
      <div className="flex items-center justify-center min-h-[80vh] p-6">
        <div className="text-center max-w-lg">
          <div className="w-24 h-24 bg-gradient-to-br from-green-500/20 to-blue-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-green-500/30">
            <span className="text-5xl">🏆</span>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">Sessione completata!</h2>
          <p className="text-slate-400 mb-8">Ottimo lavoro, continua così!</p>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <p className="text-2xl font-bold text-white">{sessionStats.reviewed}</p>
              <p className="text-slate-400 text-sm">Carte riviste</p>
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <p className={`text-2xl font-bold ${accuracy >= 70 ? "text-green-400" : accuracy >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                {accuracy}%
              </p>
              <p className="text-slate-400 text-sm">Accuratezza</p>
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <p className="text-2xl font-bold text-green-400">{sessionStats.good + sessionStats.easy}</p>
              <p className="text-slate-400 text-sm">Corrette</p>
            </div>
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
              <p className="text-2xl font-bold text-red-400">{sessionStats.again}</p>
              <p className="text-slate-400 text-sm">Da rivedere</p>
            </div>
          </div>

          {/* Rating Breakdown */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-8">
            <h3 className="text-white font-medium mb-4">Dettaglio risposte</h3>
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-lg bg-red-500/20 flex items-center justify-center mx-auto mb-2">
                  <span className="text-red-400 font-bold">{sessionStats.again}</span>
                </div>
                <p className="text-slate-500 text-xs">Again</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center mx-auto mb-2">
                  <span className="text-orange-400 font-bold">{sessionStats.hard}</span>
                </div>
                <p className="text-slate-500 text-xs">Hard</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center mx-auto mb-2">
                  <span className="text-green-400 font-bold">{sessionStats.good}</span>
                </div>
                <p className="text-slate-500 text-xs">Good</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center mx-auto mb-2">
                  <span className="text-blue-400 font-bold">{sessionStats.easy}</span>
                </div>
                <p className="text-slate-500 text-xs">Easy</p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4">
            <Link
              href="/dashboard/study"
              className="px-6 py-3 bg-slate-800 border border-slate-700 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors"
            >
              Torna allo Hub
            </Link>
            <Link
              href="/dashboard"
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  const progress = ((currentIndex + 1) / cards.length) * 100;

  return (
    <div className="min-h-[80vh] flex flex-col p-6 md:p-8">
      <div className="max-w-3xl mx-auto w-full flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/dashboard/study"
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Esci</span>
          </Link>
          <div className="text-center">
            <p className="text-white font-medium">{currentCard.sourceTitle}</p>
            <p className="text-slate-500 text-sm">{currentCard.chapterTitle}</p>
          </div>
          <div className="text-right">
            <p className="text-white font-medium">{currentIndex + 1} / {cards.length}</p>
            <p className="text-slate-500 text-sm">{Math.round(progress)}%</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-slate-800 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Flashcard */}
        <div className="flex-1 flex items-center justify-center">
          <div
            onClick={() => !isFlipped && setIsFlipped(true)}
            className={`w-full max-w-2xl min-h-[400px] bg-slate-800 rounded-2xl border-2 transition-all duration-300 cursor-pointer flex flex-col ${
              isFlipped
                ? "border-purple-500/50"
                : "border-slate-700 hover:border-blue-500/50"
            }`}
          >
            {/* Card Header */}
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                isFlipped
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-blue-500/20 text-blue-400"
              }`}>
                {isFlipped ? "Risposta" : "Domanda"}
              </span>
              {currentCard.review.state === 0 && (
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">Nuova</span>
              )}
            </div>

            {/* Card Content */}
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <p className="text-xl md:text-2xl text-white leading-relaxed">
                  {isFlipped ? currentCard.back : currentCard.front}
                </p>
              </div>
            </div>

            {/* Card Footer */}
            {!isFlipped && (
              <div className="px-6 py-4 border-t border-slate-700 text-center">
                <p className="text-slate-500 text-sm">
                  Clicca o premi <kbd className="px-2 py-1 bg-slate-700 rounded text-slate-400 text-xs">Spazio</kbd> per mostrare la risposta
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Rating Buttons */}
        {isFlipped && (
          <div className="mt-8 animate-fadeIn">
            <p className="text-center text-slate-400 text-sm mb-4">
              Quanto bene ricordavi questa carta?
            </p>
            <div className="grid grid-cols-4 gap-3">
              <button
                onClick={() => handleRating(1)}
                className="flex flex-col items-center gap-2 py-4 px-2 bg-red-500/10 border border-red-500/30 rounded-xl hover:bg-red-500/20 transition-colors group"
              >
                <span className="text-red-400 font-medium">Again</span>
                <kbd className="text-slate-500 text-xs group-hover:text-slate-400">1</kbd>
              </button>
              <button
                onClick={() => handleRating(2)}
                className="flex flex-col items-center gap-2 py-4 px-2 bg-orange-500/10 border border-orange-500/30 rounded-xl hover:bg-orange-500/20 transition-colors group"
              >
                <span className="text-orange-400 font-medium">Hard</span>
                <kbd className="text-slate-500 text-xs group-hover:text-slate-400">2</kbd>
              </button>
              <button
                onClick={() => handleRating(3)}
                className="flex flex-col items-center gap-2 py-4 px-2 bg-green-500/10 border border-green-500/30 rounded-xl hover:bg-green-500/20 transition-colors group"
              >
                <span className="text-green-400 font-medium">Good</span>
                <kbd className="text-slate-500 text-xs group-hover:text-slate-400">3</kbd>
              </button>
              <button
                onClick={() => handleRating(4)}
                className="flex flex-col items-center gap-2 py-4 px-2 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20 transition-colors group"
              >
                <span className="text-blue-400 font-medium">Easy</span>
                <kbd className="text-slate-500 text-xs group-hover:text-slate-400">4</kbd>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

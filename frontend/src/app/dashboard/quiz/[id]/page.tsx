"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Quiz, QuizQuestion } from "@/lib/supabase";
import Link from "next/link";

export default function QuizPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const quizId = params.id as string;

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [openAnswer, setOpenAnswer] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [currentResult, setCurrentResult] = useState<{
    is_correct: boolean;
    feedback?: string;
    correct_answer: string;
    explanation?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [score, setScore] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  // Set breadcrumb
  useBreadcrumb(
    quiz
      ? [
          { label: "I miei libri", href: "/dashboard" },
          { label: quiz.title },
        ]
      : [{ label: "Quiz" }]
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user && quizId) {
      fetchQuiz();
    }
  }, [user, authLoading, quizId]);

  const fetchQuiz = async () => {
    setLoading(true);
    try {
      const { data: quizData, error: quizError } = await supabase
        .from("quizzes")
        .select("*")
        .eq("id", quizId)
        .single();

      if (quizError) throw quizError;
      setQuiz(quizData);

      const { data: questionsData, error: questionsError } = await supabase
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", quizId)
        .order("order_index", { ascending: true });

      if (questionsError) throw questionsError;
      setQuestions(questionsData || []);

      // Calculate current score from already answered questions
      const answered = questionsData?.filter(q => q.is_correct !== null) || [];
      const correctCount = answered.filter(q => q.is_correct).length;
      setScore(correctCount);

      // Find first unanswered question
      const firstUnanswered = questionsData?.findIndex(q => q.is_correct === null);
      if (firstUnanswered !== undefined && firstUnanswered >= 0) {
        setCurrentIndex(firstUnanswered);
      } else if (questionsData && questionsData.length > 0) {
        setIsComplete(true);
      }
    } catch (err) {
      console.error("Error fetching quiz:", err);
      setError("Errore nel caricamento del quiz");
    } finally {
      setLoading(false);
    }
  };

  const currentQuestion = questions[currentIndex];

  const handleSubmitAnswer = async () => {
    if (!currentQuestion) return;

    const answer = currentQuestion.question_type === "open_ended" ? openAnswer : selectedAnswer;
    if (!answer) return;

    setEvaluating(true);
    setError("");

    try {
      const response = await fetch("/api/quiz/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId: currentQuestion.id,
          userAnswer: answer,
          language: "it",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Valutazione fallita");
      }

      setCurrentResult(data);
      setShowResult(true);

      if (data.is_correct) {
        setScore(prev => prev + 1);
      }

      // Update local state
      setQuestions(prev =>
        prev.map(q =>
          q.id === currentQuestion.id
            ? { ...q, user_answer: answer, is_correct: data.is_correct, ai_feedback: data.feedback }
            : q
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la valutazione");
    } finally {
      setEvaluating(false);
    }
  };

  const handleNext = async () => {
    setShowResult(false);
    setCurrentResult(null);
    setSelectedAnswer(null);
    setOpenAnswer("");

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      // Quiz complete - update score in database
      setIsComplete(true);
      await supabase
        .from("quizzes")
        .update({
          score: score,
          completed_at: new Date().toISOString()
        })
        .eq("id", quizId);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-slate-400">Caricamento quiz...</p>
        </div>
      </div>
    );
  }

  if (error && !quiz) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">😕</span>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">{error}</h2>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            Torna alla dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (isComplete) {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <div className="flex items-center justify-center min-h-[50vh] px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">
              {percentage >= 80 ? "🎉" : percentage >= 60 ? "👍" : "📚"}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Quiz Completato!</h1>
          <p className="text-slate-400 mb-6">{quiz?.title}</p>

          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 mb-6">
            <div className="text-5xl font-bold text-white mb-2">
              {score}/{questions.length}
            </div>
            <div className="text-slate-400">
              {percentage}% corretto
            </div>
            <div className="mt-4 h-3 bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  percentage >= 80
                    ? "bg-emerald-500"
                    : percentage >= 60
                    ? "bg-yellow-500"
                    : "bg-red-500"
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                setReviewMode(true);
                setIsComplete(false);
                setCurrentIndex(0);
              }}
              className="w-full px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Rivedi Risposte
            </button>
            <Link
              href="/dashboard/study"
              className="block w-full px-6 py-3 bg-slate-700 text-white rounded-xl font-semibold hover:bg-slate-600 transition-colors text-center"
            >
              Torna allo Studio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) return null;

  // Review mode - show all answers
  if (reviewMode) {
    return (
      <div className="p-6 md:p-8">
        {/* Back button */}
        <div className="max-w-3xl mx-auto mb-4">
          <button
            onClick={() => {
              setReviewMode(false);
              setIsComplete(true);
            }}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Torna ai risultati
          </button>
        </div>

        {/* Review header */}
        <div className="max-w-3xl mx-auto mb-6">
          <h1 className="text-xl font-bold text-white mb-2">Revisione: {quiz?.title}</h1>
          <div className="flex items-center gap-4">
            <span className="text-slate-400">Domanda {currentIndex + 1} di {questions.length}</span>
            <span className={`text-sm font-medium ${currentQuestion.is_correct ? 'text-emerald-400' : 'text-red-400'}`}>
              {currentQuestion.is_correct ? '✓ Corretta' : '✗ Sbagliata'}
            </span>
          </div>
        </div>

        {/* Question card */}
        <div className="max-w-3xl mx-auto">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 mb-6">
            <h2 className="text-xl font-semibold text-white mb-6">{currentQuestion.question}</h2>

            {/* Options with correct/wrong highlighting */}
            {currentQuestion.question_type !== "open_ended" ? (
              <div className="space-y-3">
                {currentQuestion.options?.map((option, idx) => (
                  <div
                    key={idx}
                    className={`w-full p-4 rounded-xl text-left ${
                      option === currentQuestion.correct_answer
                        ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400"
                        : option === currentQuestion.user_answer && !currentQuestion.is_correct
                        ? "bg-red-500/20 border-2 border-red-500 text-red-400"
                        : "bg-slate-700 border-2 border-transparent text-slate-400"
                    }`}
                  >
                    <span className="font-medium">{String.fromCharCode(65 + idx)}.</span> {option}
                    {option === currentQuestion.correct_answer && (
                      <span className="ml-2 text-emerald-400">✓ Corretta</span>
                    )}
                    {option === currentQuestion.user_answer && option !== currentQuestion.correct_answer && (
                      <span className="ml-2 text-red-400">← La tua risposta</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl ${currentQuestion.is_correct ? 'bg-emerald-500/20 border border-emerald-500/50' : 'bg-red-500/20 border border-red-500/50'}`}>
                  <p className="text-sm text-slate-400 mb-1">La tua risposta:</p>
                  <p className="text-white">{currentQuestion.user_answer}</p>
                </div>
                <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/50">
                  <p className="text-sm text-slate-400 mb-1">Risposta corretta:</p>
                  <p className="text-emerald-400">{currentQuestion.correct_answer}</p>
                </div>
              </div>
            )}

            {/* AI Feedback */}
            {currentQuestion.ai_feedback && (
              <div className="mt-4 p-4 bg-slate-700 rounded-xl">
                <p className="text-sm text-slate-400 mb-1">Feedback:</p>
                <p className="text-slate-300">{currentQuestion.ai_feedback}</p>
              </div>
            )}

            {/* Explanation */}
            {currentQuestion.explanation && (
              <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <p className="text-sm text-blue-400 mb-1">Spiegazione:</p>
                <p className="text-slate-300">{currentQuestion.explanation}</p>
              </div>
            )}
          </div>

          {/* Navigation buttons */}
          <div className="flex justify-between">
            <button
              onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
              disabled={currentIndex === 0}
              className="px-6 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Precedente
            </button>
            <button
              onClick={() => setCurrentIndex(prev => Math.min(questions.length - 1, prev + 1))}
              disabled={currentIndex === questions.length - 1}
              className="px-6 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Successiva
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {/* Back button */}
      <div className="max-w-3xl mx-auto mb-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Esci dal quiz
        </button>
      </div>

      {/* Quiz progress header */}
      <div className="max-w-3xl mx-auto mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="text-slate-400 text-sm">
            {currentIndex + 1} / {questions.length}
          </div>
          <div className="text-emerald-400 font-medium">
            {score} punti
          </div>
        </div>
        {/* Progress bar */}
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-600 transition-all"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Question */}
      <div className="max-w-3xl mx-auto">
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 mb-6">
          {/* Question type badge */}
          <div className="mb-4">
            <span className={`px-3 py-1 text-xs rounded-full ${
              currentQuestion.question_type === "multiple_choice"
                ? "bg-blue-500/20 text-blue-400"
                : currentQuestion.question_type === "true_false"
                ? "bg-purple-500/20 text-purple-400"
                : "bg-orange-500/20 text-orange-400"
            }`}>
              {currentQuestion.question_type === "multiple_choice"
                ? "Scelta Multipla"
                : currentQuestion.question_type === "true_false"
                ? "Vero o Falso"
                : "Risposta Aperta"}
            </span>
          </div>

          {/* Question text */}
          <h2 className="text-xl font-semibold text-white mb-6">
            {currentQuestion.question}
          </h2>

          {/* Answer options */}
          {currentQuestion.question_type !== "open_ended" ? (
            <div className="space-y-3">
              {currentQuestion.options?.map((option, idx) => (
                <button
                  key={idx}
                  onClick={() => !showResult && setSelectedAnswer(option)}
                  disabled={showResult}
                  className={`w-full p-4 rounded-xl text-left transition-all ${
                    showResult
                      ? option === currentResult?.correct_answer
                        ? "bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400"
                        : option === selectedAnswer && !currentResult?.is_correct
                        ? "bg-red-500/20 border-2 border-red-500 text-red-400"
                        : "bg-slate-700 border-2 border-transparent text-slate-400"
                      : selectedAnswer === option
                      ? "bg-blue-500/20 border-2 border-blue-500 text-white"
                      : "bg-slate-700 border-2 border-transparent text-slate-300 hover:bg-slate-600"
                  }`}
                >
                  <span className="font-medium">{String.fromCharCode(65 + idx)}.</span> {option}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={openAnswer}
              onChange={(e) => setOpenAnswer(e.target.value)}
              disabled={showResult}
              placeholder="Scrivi la tua risposta..."
              className="w-full h-32 p-4 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none disabled:opacity-50"
            />
          )}
        </div>

        {/* Result feedback */}
        {showResult && currentResult && (
          <div className={`rounded-2xl border p-6 mb-6 ${
            currentResult.is_correct
              ? "bg-emerald-500/10 border-emerald-500/50"
              : "bg-red-500/10 border-red-500/50"
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">
                {currentResult.is_correct ? "✓" : "✗"}
              </span>
              <span className={`text-lg font-semibold ${
                currentResult.is_correct ? "text-emerald-400" : "text-red-400"
              }`}>
                {currentResult.is_correct ? "Corretto!" : "Non corretto"}
              </span>
            </div>

            {currentResult.feedback && (
              <p className="text-slate-300 mb-3">{currentResult.feedback}</p>
            )}

            {!currentResult.is_correct && (
              <p className="text-slate-400 text-sm">
                <span className="font-medium">Risposta corretta:</span> {currentResult.correct_answer}
              </p>
            )}

            {currentResult.explanation && (
              <p className="text-slate-400 text-sm mt-2">
                <span className="font-medium">Spiegazione:</span> {currentResult.explanation}
              </p>
            )}
          </div>
        )}

        {/* Action button */}
        <div className="flex justify-end">
          {!showResult ? (
            <button
              onClick={handleSubmitAnswer}
              disabled={
                evaluating ||
                (currentQuestion.question_type === "open_ended" ? !openAnswer.trim() : !selectedAnswer)
              }
              className="px-8 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {evaluating ? (
                <>
                  <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Valutazione...
                </>
              ) : (
                "Conferma"
              )}
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              {currentIndex < questions.length - 1 ? "Prossima Domanda" : "Termina Quiz"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

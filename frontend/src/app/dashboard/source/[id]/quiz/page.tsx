"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter, Quiz } from "@/lib/supabase";

export default function SourceQuizPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sourceId = params.id as string;

  const [source, setSource] = useState<Source | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChapter, setSelectedChapter] = useState<string>("all");

  // Generate modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateChapterId, setGenerateChapterId] = useState<string>("");
  const [generateCount, setGenerateCount] = useState(10);
  const [generateDifficulty, setGenerateDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [generating, setGenerating] = useState(false);

  useBreadcrumb(
    source
      ? [
          { label: "I miei libri", href: "/dashboard" },
          { label: source.title, href: `/dashboard/source/${sourceId}` },
          { label: "Quiz" },
        ]
      : []
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user && sourceId) {
      fetchData();
    }
  }, [user, authLoading, sourceId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch source
      const { data: sourceData } = await supabase
        .from("sources")
        .select("*")
        .eq("id", sourceId)
        .single();

      if (sourceData) setSource(sourceData);

      // Fetch chapters
      const { data: chaptersData } = await supabase
        .from("chapters")
        .select("*")
        .eq("source_id", sourceId)
        .eq("processing_status", "completed")
        .order("order_index");

      if (chaptersData) {
        setChapters(chaptersData);
        if (chaptersData.length > 0 && !generateChapterId) {
          setGenerateChapterId(chaptersData[0].id);
        }
      }

      // Fetch quizzes for all chapters of this source
      const chapterIds = chaptersData?.map(c => c.id) || [];
      if (chapterIds.length > 0) {
        const { data: quizzesData } = await supabase
          .from("quizzes")
          .select("*, chapters(title)")
          .in("chapter_id", chapterIds)
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false });

        if (quizzesData) setQuizzes(quizzesData);
      }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!user || !generateChapterId) return;

    setGenerating(true);
    try {
      const response = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: generateChapterId,
          userId: user.id,
          numQuestions: generateCount,
          difficulty: generateDifficulty,
          language: "it",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error("Generazione fallita");
      }

      setShowGenerateModal(false);
      // Navigate to the new quiz
      router.push(`/dashboard/quiz/${data.quiz_id}`);
    } catch (err) {
      console.error("Error generating:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (!user) return;

    try {
      await supabase.from("quiz_questions").delete().eq("quiz_id", quizId);
      await supabase.from("quizzes").delete().eq("id", quizId);

      setQuizzes(prev => prev.filter(q => q.id !== quizId));
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  const filteredQuizzes = selectedChapter === "all"
    ? quizzes
    : quizzes.filter(q => q.chapter_id === selectedChapter);

  const completedQuizzes = quizzes.filter(q => q.completed_at);
  const avgScore = completedQuizzes.length > 0
    ? Math.round(completedQuizzes.reduce((acc, q) => acc + ((q.score || 0) / (q.total_questions || 1)) * 100, 0) / completedQuizzes.length)
    : 0;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href={`/dashboard/source/${sourceId}`}
          className="text-slate-400 hover:text-white text-sm flex items-center gap-2 mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Torna al libro
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <span className="text-4xl">📝</span>
              Quiz
            </h1>
            <p className="text-slate-400 mt-1">{source?.title}</p>
          </div>
          <button
            onClick={() => setShowGenerateModal(true)}
            disabled={chapters.length === 0}
            className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            <span>✨</span>
            Nuovo Quiz
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="mb-6 flex items-center gap-4">
        <label className="text-slate-400 text-sm">Filtra per capitolo:</label>
        <select
          value={selectedChapter}
          onChange={(e) => setSelectedChapter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="all">Tutti ({quizzes.length})</option>
          {chapters.map(ch => {
            const count = quizzes.filter(q => q.chapter_id === ch.id).length;
            return (
              <option key={ch.id} value={ch.id}>
                {ch.title} ({count})
              </option>
            );
          })}
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-3xl font-bold text-white">{quizzes.length}</div>
          <div className="text-slate-400 text-sm">Quiz creati</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-3xl font-bold text-emerald-400">{completedQuizzes.length}</div>
          <div className="text-slate-400 text-sm">Completati</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-3xl font-bold text-amber-400">{avgScore}%</div>
          <div className="text-slate-400 text-sm">Media punteggio</div>
        </div>
      </div>

      {/* Quizzes List */}
      {filteredQuizzes.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-12 text-center">
          <div className="w-20 h-20 bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">📝</span>
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">Nessun quiz</h3>
          <p className="text-slate-400 mb-6">
            {chapters.length === 0
              ? "Elabora prima un capitolo per creare quiz"
              : "Crea il tuo primo quiz per testare le tue conoscenze"
            }
          </p>
          {chapters.length > 0 && (
            <button
              onClick={() => setShowGenerateModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Crea Quiz
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredQuizzes.map((quiz) => {
            const chapter = chapters.find(c => c.id === quiz.chapter_id);
            const scorePercent = quiz.completed_at && quiz.total_questions
              ? Math.round((quiz.score || 0) / quiz.total_questions * 100)
              : null;

            return (
              <div
                key={quiz.id}
                className="bg-slate-800 border border-slate-700 rounded-xl p-5 hover:border-emerald-500/50 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                      quiz.completed_at
                        ? scorePercent! >= 70 ? "bg-emerald-500/20" : "bg-amber-500/20"
                        : "bg-slate-700"
                    }`}>
                      {quiz.completed_at ? (
                        <span className={`text-xl font-bold ${
                          scorePercent! >= 70 ? "text-emerald-400" : "text-amber-400"
                        }`}>
                          {scorePercent}%
                        </span>
                      ) : (
                        <span className="text-2xl">📝</span>
                      )}
                    </div>
                    <div>
                      <h3 className="text-white font-medium">
                        Quiz - {chapter?.title || "Capitolo"}
                      </h3>
                      <p className="text-slate-400 text-sm">
                        {quiz.total_questions} domande
                        {quiz.completed_at && ` - ${quiz.score}/${quiz.total_questions} corrette`}
                      </p>
                      <p className="text-slate-500 text-xs mt-1">
                        {new Date(quiz.created_at).toLocaleDateString("it-IT", {
                          day: "numeric",
                          month: "long",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {quiz.completed_at ? (
                      <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                        Completato
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                        In corso
                      </span>
                    )}
                    <Link
                      href={`/dashboard/quiz/${quiz.id}`}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity"
                    >
                      {quiz.completed_at ? "Rivedi" : "Continua"}
                    </Link>
                    <button
                      onClick={() => handleDeleteQuiz(quiz.id)}
                      className="p-2 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded-lg transition-all"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Generate Modal */}
      {showGenerateModal && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40" onClick={() => !generating && setShowGenerateModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl z-50 p-6">
            <h3 className="text-white text-xl font-semibold mb-6">Crea Nuovo Quiz</h3>

            <div className="space-y-5">
              <div>
                <label className="text-slate-400 text-sm block mb-2">Capitolo</label>
                <select
                  value={generateChapterId}
                  onChange={(e) => setGenerateChapterId(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {chapters.map(ch => (
                    <option key={ch.id} value={ch.id}>{ch.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 text-sm block mb-2">Numero domande</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="5"
                    max="30"
                    value={generateCount}
                    onChange={(e) => setGenerateCount(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-white font-bold w-8 text-center">{generateCount}</span>
                </div>
              </div>

              <div>
                <label className="text-slate-400 text-sm block mb-2">Difficolta</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["easy", "medium", "hard"] as const).map(d => (
                    <button
                      key={d}
                      onClick={() => setGenerateDifficulty(d)}
                      className={`py-3 rounded-xl border-2 transition-all ${
                        generateDifficulty === d
                          ? "border-emerald-500 bg-emerald-500/20 text-white"
                          : "border-slate-600 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {d === "easy" ? "Facile" : d === "medium" ? "Media" : "Difficile"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowGenerateModal(false)}
                disabled={generating}
                className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Generando...
                  </>
                ) : (
                  "Crea Quiz"
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

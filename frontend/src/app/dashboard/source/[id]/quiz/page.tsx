"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter, Quiz } from "@/lib/supabase";

interface QuizWithChapter extends Quiz {
  chapters?: { title: string };
}

export default function SourceQuizPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sourceId = params.id as string;

  const [source, setSource] = useState<Source | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [quizzes, setQuizzes] = useState<QuizWithChapter[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterChapter, setFilterChapter] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("all");

  // Collapsed state
  const [collapsedDifficulties, setCollapsedDifficulties] = useState<Set<string>>(new Set());

  // Generate modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateChapterId, setGenerateChapterId] = useState<string>("");
  const [generateCount, setGenerateCount] = useState(10);
  const [generateDifficulty, setGenerateDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [includeTrueFalse, setIncludeTrueFalse] = useState(true);
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
      const { data: sourceData } = await supabase
        .from("sources")
        .select("*")
        .eq("id", sourceId)
        .single();

      if (sourceData) setSource(sourceData);

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
          includeTrueFalse,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error("Generazione fallita");
      }

      setShowGenerateModal(false);
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

  // Unique dates for filter
  const uniqueDates = useMemo(() => {
    const dates = new Set<string>();
    quizzes.forEach(q => {
      if (q.created_at) {
        dates.add(new Date(q.created_at).toLocaleDateString("it-IT"));
      }
    });
    return Array.from(dates).sort().reverse();
  }, [quizzes]);

  // Apply filters
  const filteredQuizzes = useMemo(() => {
    return quizzes.filter(q => {
      if (filterChapter !== "all" && q.chapter_id !== filterChapter) return false;
      if (filterDate !== "all") {
        const qDate = q.created_at ? new Date(q.created_at).toLocaleDateString("it-IT") : "";
        if (qDate !== filterDate) return false;
      }
      return true;
    });
  }, [quizzes, filterChapter, filterDate]);

  // Group by difficulty
  const difficultyGroups = useMemo(() => {
    const configs = [
      { key: "easy", label: "Facile", icon: "🟢", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" },
      { key: "medium", label: "Media", icon: "🟡", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30" },
      { key: "hard", label: "Difficile", icon: "🔴", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" },
    ];

    return configs
      .map(config => {
        const items = filteredQuizzes.filter(q => q.difficulty === config.key);
        return { ...config, quizzes: items };
      })
      .filter(g => g.quizzes.length > 0);
  }, [filteredQuizzes]);

  const toggleDifficulty = (key: string) => {
    setCollapsedDifficulties(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const completedQuizzes = quizzes.filter(q => q.completed_at);
  const avgScore = completedQuizzes.length > 0
    ? Math.round(completedQuizzes.reduce((acc, q) => acc + ((q.score || 0) / (q.total_questions || 1)) * 100, 0) / completedQuizzes.length)
    : 0;

  const difficultyLabel = (d: string) =>
    d === "easy" ? "Facile" : d === "hard" ? "Difficile" : "Media";

  const activeFiltersCount = [filterChapter, filterDate].filter(f => f !== "all").length;

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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
          <div className="text-3xl font-bold text-white">{quizzes.length}</div>
          <div className="text-slate-400 text-sm">Quiz creati</div>
        </div>
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
          <div className="text-3xl font-bold text-emerald-400">{completedQuizzes.length}</div>
          <div className="text-slate-400 text-sm">Completati</div>
        </div>
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
          <div className="text-3xl font-bold text-amber-400">{avgScore}%</div>
          <div className="text-slate-400 text-sm">Media punteggio</div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-white font-medium text-sm">Filtri</span>
            {activeFiltersCount > 0 && (
              <span className="bg-emerald-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {activeFiltersCount}
              </span>
            )}
          </div>
          {activeFiltersCount > 0 && (
            <button
              onClick={() => { setFilterChapter("all"); setFilterDate("all"); }}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Resetta filtri
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={filterChapter}
            onChange={(e) => setFilterChapter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Tutti i capitoli</option>
            {chapters.map(ch => {
              const count = quizzes.filter(q => q.chapter_id === ch.id).length;
              return (
                <option key={ch.id} value={ch.id}>
                  {ch.title} ({count})
                </option>
              );
            })}
          </select>

          <select
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">Tutte le date</option>
            {uniqueDates.map(date => (
              <option key={date} value={date}>{date}</option>
            ))}
          </select>
        </div>

        {filteredQuizzes.length !== quizzes.length && (
          <div className="mt-3 text-sm text-slate-400">
            Mostrando {filteredQuizzes.length} di {quizzes.length} quiz
          </div>
        )}
      </div>

      {/* Quiz List grouped by difficulty */}
      {filteredQuizzes.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-12 text-center">
          <div className="w-20 h-20 bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">📝</span>
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">
            {quizzes.length === 0 ? "Nessun quiz" : "Nessun risultato"}
          </h3>
          <p className="text-slate-400 mb-6">
            {quizzes.length === 0
              ? chapters.length === 0
                ? "Elabora prima un capitolo per creare quiz"
                : "Crea il tuo primo quiz per testare le tue conoscenze"
              : "Prova a modificare i filtri"
            }
          </p>
          {quizzes.length === 0 && chapters.length > 0 && (
            <button
              onClick={() => setShowGenerateModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Crea Quiz
            </button>
          )}
          {quizzes.length > 0 && activeFiltersCount > 0 && (
            <button
              onClick={() => { setFilterChapter("all"); setFilterDate("all"); }}
              className="px-6 py-3 bg-slate-700 text-white rounded-xl font-semibold hover:bg-slate-600 transition-colors"
            >
              Resetta filtri
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {difficultyGroups.map((group) => {
            const isCollapsed = collapsedDifficulties.has(group.key);

            return (
              <div
                key={group.key}
                className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden"
              >
                {/* Difficulty Header */}
                <button
                  onClick={() => toggleDifficulty(group.key)}
                  className="w-full px-5 py-4 flex items-center gap-4 hover:bg-white/5 transition-colors"
                >
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                      isCollapsed ? "" : "rotate-90"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>

                  <span className="text-xl">{group.icon}</span>

                  <div className="flex-1 text-left">
                    <span className="text-white font-semibold text-lg">{group.label}</span>
                    <span className="text-slate-400 text-sm ml-3">
                      {group.quizzes.length} {group.quizzes.length === 1 ? "quiz" : "quiz"}
                    </span>
                  </div>

                  <span className={`text-sm px-3 py-1 rounded-lg font-bold ${group.bgColor} ${group.borderColor} border`}>
                    {group.quizzes.length}
                  </span>
                </button>

                {/* Quiz Items */}
                {!isCollapsed && (
                  <div className="px-4 pb-4 space-y-2">
                    {group.quizzes.map((quiz) => {
                      const chapter = chapters.find(c => c.id === quiz.chapter_id);
                      const scorePercent = quiz.completed_at && quiz.total_questions
                        ? Math.round((quiz.score || 0) / quiz.total_questions * 100)
                        : null;

                      return (
                        <div
                          key={quiz.id}
                          className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 hover:border-emerald-500/30 transition-all group"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                                quiz.completed_at
                                  ? scorePercent! >= 70 ? "bg-emerald-500/20" : "bg-amber-500/20"
                                  : "bg-slate-700"
                              }`}>
                                {quiz.completed_at ? (
                                  <span className={`text-lg font-bold ${
                                    scorePercent! >= 70 ? "text-emerald-400" : "text-amber-400"
                                  }`}>
                                    {scorePercent}%
                                  </span>
                                ) : (
                                  <span className="text-xl">📝</span>
                                )}
                              </div>
                              <div>
                                <h3 className="text-white font-medium text-sm">
                                  Quiz - {chapter?.title || quiz.chapters?.title || "Capitolo"}
                                </h3>
                                <p className="text-slate-400 text-xs mt-0.5">
                                  {quiz.total_questions} domande
                                  {quiz.completed_at && ` · ${quiz.score}/${quiz.total_questions} corrette`}
                                  {" · "}
                                  {new Date(quiz.created_at).toLocaleDateString("it-IT", {
                                    day: "numeric",
                                    month: "long",
                                    hour: "2-digit",
                                    minute: "2-digit"
                                  })}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {quiz.completed_at ? (
                                <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">
                                  Completato
                                </span>
                              ) : (
                                <span className="px-2.5 py-1 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                                  In corso
                                </span>
                              )}
                              <Link
                                href={`/dashboard/quiz/${quiz.id}`}
                                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-lg font-medium hover:opacity-90 transition-opacity text-sm"
                              >
                                {quiz.completed_at ? "Rivedi" : "Continua"}
                              </Link>
                              <button
                                onClick={() => handleDeleteQuiz(quiz.id)}
                                className="p-2 text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-500/20 rounded-lg transition-all"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                      {difficultyLabel(d)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-slate-400 text-sm block mb-2">Includi Vero/Falso</label>
                <button
                  onClick={() => setIncludeTrueFalse(!includeTrueFalse)}
                  className={`flex items-center gap-3 w-full py-3 px-4 rounded-xl border-2 transition-all ${
                    includeTrueFalse
                      ? "border-emerald-500 bg-emerald-500/20 text-white"
                      : "border-slate-600 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  <div className={`w-10 h-6 rounded-full transition-colors flex items-center ${
                    includeTrueFalse ? "bg-emerald-500 justify-end" : "bg-slate-600 justify-start"
                  }`}>
                    <div className="w-5 h-5 rounded-full bg-white mx-0.5 shadow" />
                  </div>
                  <span className="text-sm">
                    {includeTrueFalse ? "Domande a scelta multipla + Vero/Falso" : "Solo scelta multipla"}
                  </span>
                </button>
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

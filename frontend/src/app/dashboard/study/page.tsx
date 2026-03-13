"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter, Quiz } from "@/lib/supabase";
import Link from "next/link";

interface SourceWithContent extends Source {
  chapters: ChapterWithContent[];
}

interface ChapterWithContent extends Chapter {
  flashcardCount: number;
  dueCount: number;
  quizzes: Quiz[];
}

type TabType = "flashcards" | "quiz" | "summaries" | "maps" | "infographics" | "presentations";

interface GeneratePopover {
  chapterId: string;
  type: TabType;
}

interface DeleteModal {
  type: "flashcards" | "quiz";
  chapterId?: string;
  quizId?: string;
  quizTitle?: string;
}

const TOOLS = [
  { id: "flashcards" as TabType, label: "Flashcard", icon: "🎴", available: true, description: "Ripassa con spaced repetition" },
  { id: "quiz" as TabType, label: "Quiz", icon: "📝", available: true, description: "Metti alla prova le tue conoscenze" },
  { id: "summaries" as TabType, label: "Riassunti", icon: "📄", available: false, description: "Riassunti AI dei capitoli" },
  { id: "maps" as TabType, label: "Mappe", icon: "🗺️", available: false, description: "Mappe concettuali visive" },
  { id: "infographics" as TabType, label: "Infografiche", icon: "📊", available: false, description: "Visualizzazioni dei concetti" },
  { id: "presentations" as TabType, label: "Slides", icon: "🎬", available: false, description: "Presentazioni generate" },
];

const GENERATION_LABELS: Record<TabType, string> = {
  flashcards: "flashcard",
  quiz: "domande",
  summaries: "paragrafi",
  maps: "nodi",
  infographics: "sezioni",
  presentations: "slide",
};

export default function StudyHubPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement>(null);

  const [sources, setSources] = useState<SourceWithContent[]>([]);
  const [selectedTool, setSelectedTool] = useState<TabType>("flashcards");
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [totalDue, setTotalDue] = useState(0);
  const [generatingFlashcardsId, setGeneratingFlashcardsId] = useState<string | null>(null);
  const [generatingQuizId, setGeneratingQuizId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Generation popover state
  const [showGeneratePopover, setShowGeneratePopover] = useState<GeneratePopover | null>(null);
  const [generateCount, setGenerateCount] = useState(10);
  const [generateDifficulty, setGenerateDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState<DeleteModal | null>(null);
  const [deleting, setDeleting] = useState(false);

  useBreadcrumb([{ label: "Studia" }]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setShowGeneratePopover(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      fetchContent();
    }
  }, [user]);

  const fetchContent = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Fetch sources
      const { data: sourcesData } = await supabase
        .from("sources")
        .select("*")
        .eq("user_id", user.id)
        .order("title", { ascending: true });

      if (!sourcesData || sourcesData.length === 0) {
        setSources([]);
        setIsLoading(false);
        return;
      }

      // Fetch chapters
      const { data: chaptersData } = await supabase
        .from("chapters")
        .select("*")
        .in("source_id", sourcesData.map(s => s.id))
        .order("order_index", { ascending: true });

      // Fetch flashcard counts per chapter
      const { data: flashcardCounts } = await supabase
        .from("flashcards")
        .select("chapter_id")
        .eq("user_id", user.id);

      const fcCountByChapter: Record<string, number> = {};
      flashcardCounts?.forEach((fc: any) => {
        fcCountByChapter[fc.chapter_id] = (fcCountByChapter[fc.chapter_id] || 0) + 1;
      });

      // Fetch due counts
      const now = new Date().toISOString();
      const { data: dueReviews } = await supabase
        .from("reviews")
        .select(`
          id,
          flashcards!inner (
            chapter_id
          )
        `)
        .eq("user_id", user.id)
        .lte("due", now);

      const dueByChapter: Record<string, number> = {};
      let totalDueCount = 0;
      dueReviews?.forEach((r: any) => {
        const chapterId = r.flashcards?.chapter_id;
        if (chapterId) {
          dueByChapter[chapterId] = (dueByChapter[chapterId] || 0) + 1;
          totalDueCount++;
        }
      });
      setTotalDue(totalDueCount);

      // Fetch quizzes
      const { data: quizzesData } = await supabase
        .from("quizzes")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const quizzesByChapter: Record<string, Quiz[]> = {};
      quizzesData?.forEach((quiz: Quiz) => {
        if (!quizzesByChapter[quiz.chapter_id]) {
          quizzesByChapter[quiz.chapter_id] = [];
        }
        quizzesByChapter[quiz.chapter_id].push(quiz);
      });

      // Combine data
      const sourcesWithContent: SourceWithContent[] = sourcesData.map(source => {
        const sourceChapters = (chaptersData || [])
          .filter(c => c.source_id === source.id)
          .map(chapter => ({
            ...chapter,
            flashcardCount: fcCountByChapter[chapter.id] || 0,
            dueCount: dueByChapter[chapter.id] || 0,
            quizzes: quizzesByChapter[chapter.id] || [],
          }));

        return {
          ...source,
          chapters: sourceChapters,
        };
      });

      setSources(sourcesWithContent);

      // Auto-expand sources with content
      const toExpand = new Set<string>();
      sourcesWithContent.forEach(s => {
        if (s.chapters.some(c => c.dueCount > 0 || c.quizzes.length > 0)) {
          toExpand.add(s.id);
        }
      });
      if (toExpand.size === 0 && sourcesWithContent.length > 0) {
        toExpand.add(sourcesWithContent[0].id);
      }
      setExpandedSources(toExpand);

    } catch (error) {
      console.error("Error fetching content:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateFlashcards = async (chapterId: string, count: number, difficulty: string) => {
    if (!user) return;

    setShowGeneratePopover(null);
    setGeneratingFlashcardsId(chapterId);
    setError(null);

    try {
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId,
          userId: user.id,
          numCards: count,
          difficulty,
          language: "it",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Generazione fallita");
      }

      // Refresh content to show new flashcards
      await fetchContent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la generazione");
    } finally {
      setGeneratingFlashcardsId(null);
    }
  };

  const handleGenerateQuiz = async (chapterId: string, count: number) => {
    if (!user) return;

    setShowGeneratePopover(null);
    setGeneratingQuizId(chapterId);
    setError(null);

    try {
      const response = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId,
          userId: user.id,
          numQuestions: count,
          difficulty: "medium",
          language: "it",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Generazione quiz fallita");
      }

      // Redirect to the new quiz
      router.push(`/dashboard/quiz/${data.quiz_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la generazione del quiz");
      setGeneratingQuizId(null);
    }
  };

  const openGeneratePopover = (chapterId: string, type: TabType) => {
    setGenerateCount(10);
    setGenerateDifficulty("medium");
    setShowGeneratePopover({ chapterId, type });
  };

  const handleGenerate = () => {
    if (!showGeneratePopover) return;
    const { chapterId, type } = showGeneratePopover;

    if (type === "flashcards") {
      handleGenerateFlashcards(chapterId, generateCount, generateDifficulty);
    } else if (type === "quiz") {
      handleGenerateQuiz(chapterId, generateCount);
    }
    // Future: summaries, maps, infographics, presentations
  };

  const handleDeleteFlashcards = async (chapterId: string) => {
    if (!user) return;

    setDeleting(true);
    setError(null);

    try {
      // First delete all reviews for flashcards in this chapter
      const { data: flashcards } = await supabase
        .from("flashcards")
        .select("id")
        .eq("chapter_id", chapterId)
        .eq("user_id", user.id);

      if (flashcards && flashcards.length > 0) {
        const flashcardIds = flashcards.map(f => f.id);
        await supabase
          .from("reviews")
          .delete()
          .in("flashcard_id", flashcardIds);
      }

      // Then delete the flashcards
      const { error: deleteError } = await supabase
        .from("flashcards")
        .delete()
        .eq("chapter_id", chapterId)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      setShowDeleteModal(null);
      await fetchContent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (!user) return;

    setDeleting(true);
    setError(null);

    try {
      // First delete quiz questions
      await supabase
        .from("quiz_questions")
        .delete()
        .eq("quiz_id", quizId);

      // Then delete the quiz
      const { error: deleteError } = await supabase
        .from("quizzes")
        .delete()
        .eq("id", quizId)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      setShowDeleteModal(null);
      await fetchContent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione del quiz");
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (!showDeleteModal) return;

    if (showDeleteModal.type === "flashcards" && showDeleteModal.chapterId) {
      handleDeleteFlashcards(showDeleteModal.chapterId);
    } else if (showDeleteModal.type === "quiz" && showDeleteModal.quizId) {
      handleDeleteQuiz(showDeleteModal.quizId);
    }
  };

  const toggleSource = (sourceId: string) => {
    setExpandedSources(prev => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  const getSourceIcon = (source: SourceWithContent) => {
    // Use topic emoji if available, otherwise fallback to type-based icon
    if (source.topic_emoji) {
      return source.topic_emoji;
    }
    switch (source.source_type) {
      case "book": return "📘";
      case "pdf": return "📄";
      case "notes": return "📝";
      default: return "📖";
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-6 text-slate-400">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6">
        <div className="text-center max-w-md">
          <div className="w-24 h-24 bg-slate-800 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-slate-700">
            <span className="text-5xl">📚</span>
          </div>
          <h2 className="text-2xl font-bold text-white mb-4">Nessun materiale</h2>
          <p className="text-slate-400 mb-8">
            Aggiungi il tuo primo libro per iniziare a creare flashcard e quiz.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            Aggiungi materiale
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Studia</h1>
            <p className="text-slate-400 mt-1">
              Scegli uno strumento e un capitolo per iniziare
            </p>
          </div>
          {totalDue > 0 && (
            <Link
              href="/dashboard/study/session"
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              <span>🎯</span>
              <span>Ripassa tutto ({totalDue})</span>
            </Link>
          )}
        </div>

        {/* Tools Tabs */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-2 mb-6">
          <div className="flex gap-1 overflow-x-auto">
            {TOOLS.map((tool) => (
              <button
                key={tool.id}
                onClick={() => tool.available && setSelectedTool(tool.id)}
                disabled={!tool.available}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg font-medium transition-all whitespace-nowrap ${
                  selectedTool === tool.id
                    ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border border-blue-500/50"
                    : tool.available
                    ? "text-slate-400 hover:text-white hover:bg-slate-700/50"
                    : "text-slate-600 cursor-not-allowed"
                }`}
              >
                <span className="text-xl">{tool.icon}</span>
                <span>{tool.label}</span>
                {!tool.available && (
                  <span className="text-xs bg-slate-700 px-2 py-0.5 rounded-full">Soon</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tool Description */}
        <div className="bg-slate-800/50 rounded-lg px-4 py-3 mb-6 border border-slate-700/50">
          <p className="text-slate-400 text-sm">
            {TOOLS.find(t => t.id === selectedTool)?.description}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Content by Source/Chapter */}
        <div className="space-y-4">
          {sources.map((source) => (
            <div key={source.id} className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
              {/* Source Header */}
              <button
                onClick={() => toggleSource(source.id)}
                className="w-full flex items-center gap-4 p-4 hover:bg-slate-700/50 transition-colors"
              >
                <span className="text-2xl">{getSourceIcon(source)}</span>
                <div className="flex-1 text-left">
                  <h3 className="text-white font-semibold">{source.title}</h3>
                  {source.author && (
                    <p className="text-slate-500 text-sm">{source.author}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {selectedTool === "flashcards" && (
                    <span className="text-blue-400 text-sm">
                      {source.chapters.reduce((acc, c) => acc + c.flashcardCount, 0)} carte
                    </span>
                  )}
                  {selectedTool === "quiz" && (
                    <span className="text-purple-400 text-sm">
                      {source.chapters.reduce((acc, c) => acc + c.quizzes.length, 0)} quiz
                    </span>
                  )}
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                      expandedSources.has(source.id) ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Chapters */}
              {expandedSources.has(source.id) && (
                <div className="border-t border-slate-700">
                  {source.chapters.length === 0 ? (
                    <div className="p-6 text-center text-slate-500">
                      <p>Nessun capitolo</p>
                      <Link
                        href={`/dashboard/source/${source.id}`}
                        className="text-blue-400 text-sm hover:text-blue-300 mt-2 inline-block"
                      >
                        Aggiungi capitoli →
                      </Link>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700/50">
                      {source.chapters.map((chapter) => (
                        <div key={chapter.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="text-white font-medium">{chapter.title}</h4>

                              {/* Flashcards Content */}
                              {selectedTool === "flashcards" && (
                                <div className="flex items-center gap-4 mt-2">
                                  {chapter.flashcardCount > 0 ? (
                                    <>
                                      <span className="text-slate-400 text-sm">
                                        {chapter.flashcardCount} flashcard
                                      </span>
                                      {chapter.dueCount > 0 && (
                                        <span className="text-orange-400 text-sm">
                                          {chapter.dueCount} da ripassare
                                        </span>
                                      )}
                                      <button
                                        onClick={() => setShowDeleteModal({
                                          type: "flashcards",
                                          chapterId: chapter.id
                                        })}
                                        className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity"
                                        title="Elimina tutte le flashcard"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Elimina
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-slate-500 text-sm">
                                      Nessuna flashcard
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Quiz Content */}
                              {selectedTool === "quiz" && (
                                <div className="mt-2">
                                  {chapter.quizzes.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                      {chapter.quizzes.map((quiz) => (
                                        <div
                                          key={quiz.id}
                                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-700 rounded-lg text-sm group"
                                        >
                                          <Link
                                            href={`/dashboard/quiz/${quiz.id}`}
                                            className="inline-flex items-center gap-2 hover:opacity-80 transition-opacity"
                                          >
                                            <span className="text-purple-400">📝</span>
                                            <span className="text-slate-300">{quiz.title}</span>
                                            {quiz.completed_at ? (
                                              <span className="text-green-400 text-xs">
                                                {quiz.score}/{quiz.total_questions}
                                              </span>
                                            ) : (
                                              <span className="text-yellow-400 text-xs">In corso</span>
                                            )}
                                          </Link>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setShowDeleteModal({
                                                type: "quiz",
                                                quizId: quiz.id,
                                                quizTitle: quiz.title
                                              });
                                            }}
                                            className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity ml-1"
                                            title="Elimina quiz"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                          </button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-slate-500 text-sm">Nessun quiz</span>
                                  )}
                                </div>
                              )}

                              {/* Coming Soon Content */}
                              {!["flashcards", "quiz"].includes(selectedTool) && (
                                <p className="text-slate-500 text-sm mt-2">
                                  Funzionalità in arrivo...
                                </p>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 ml-4 relative">
                              {selectedTool === "flashcards" && chapter.processing_status === "completed" && (
                                <>
                                  {chapter.dueCount > 0 && (
                                    <Link
                                      href={`/dashboard/study/session?chapter=${chapter.id}`}
                                      className="px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                                    >
                                      Ripassa ({chapter.dueCount})
                                    </Link>
                                  )}
                                  <button
                                    onClick={() => openGeneratePopover(chapter.id, "flashcards")}
                                    disabled={generatingFlashcardsId !== null || generatingQuizId !== null}
                                    className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                                  >
                                    {generatingFlashcardsId === chapter.id ? (
                                      <>
                                        <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                        Generando...
                                      </>
                                    ) : (
                                      <>
                                        <span>+</span>
                                        Genera
                                      </>
                                    )}
                                  </button>
                                </>
                              )}

                              {selectedTool === "quiz" && chapter.processing_status === "completed" && (
                                <button
                                  onClick={() => openGeneratePopover(chapter.id, "quiz")}
                                  disabled={generatingFlashcardsId !== null || generatingQuizId !== null}
                                  className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                                >
                                  {generatingQuizId === chapter.id ? (
                                    <>
                                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                      Generando...
                                    </>
                                  ) : (
                                    "+ Nuovo Quiz"
                                  )}
                                </button>
                              )}

                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
            <p className="text-3xl font-bold text-blue-400">
              {sources.reduce((acc, s) => acc + s.chapters.reduce((a, c) => a + c.flashcardCount, 0), 0)}
            </p>
            <p className="text-slate-400 text-sm">Flashcard totali</p>
          </div>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
            <p className="text-3xl font-bold text-orange-400">{totalDue}</p>
            <p className="text-slate-400 text-sm">Da ripassare</p>
          </div>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
            <p className="text-3xl font-bold text-purple-400">
              {sources.reduce((acc, s) => acc + s.chapters.reduce((a, c) => a + c.quizzes.length, 0), 0)}
            </p>
            <p className="text-slate-400 text-sm">Quiz creati</p>
          </div>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 text-center">
            <p className="text-3xl font-bold text-green-400">
              {sources.reduce((acc, s) => acc + s.chapters.filter(c => c.processing_status === "completed").length, 0)}
            </p>
            <p className="text-slate-400 text-sm">Capitoli pronti</p>
          </div>
        </div>
      </div>

      {/* Generate Modal - Fixed position to avoid overflow issues */}
      {showGeneratePopover && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowGeneratePopover(null)}
          />
          {/* Modal */}
          <div
            ref={popoverRef}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl z-50 p-6 animate-fadeIn"
          >
            <h4 className="text-white font-semibold text-lg mb-4">
              Configura generazione {GENERATION_LABELS[showGeneratePopover.type]}
            </h4>

            {/* Quantity */}
            <div className="mb-5">
              <label className="text-slate-400 text-sm mb-2 block">Quantità</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={generateCount}
                  onChange={(e) => setGenerateCount(Number(e.target.value))}
                  className="flex-1 accent-blue-500 h-2"
                />
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={generateCount}
                  onChange={(e) => setGenerateCount(Math.min(30, Math.max(1, Number(e.target.value))))}
                  className="w-20 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-center text-lg font-medium"
                />
              </div>
            </div>

            {/* Difficulty - only for flashcards */}
            {showGeneratePopover.type === "flashcards" && (
              <div className="mb-6">
                <label className="text-slate-400 text-sm mb-2 block">Difficoltà</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: "easy", label: "Facile", emoji: "🟢", desc: "Definizioni base" },
                    { value: "medium", label: "Media", emoji: "🟡", desc: "Comprensione" },
                    { value: "hard", label: "Difficile", emoji: "🔴", desc: "Analisi critica" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setGenerateDifficulty(opt.value)}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        generateDifficulty === opt.value
                          ? "border-blue-500 bg-blue-500/20"
                          : "border-slate-600 bg-slate-700/50 hover:border-slate-500"
                      }`}
                    >
                      <div className="text-xl mb-1">{opt.emoji}</div>
                      <div className="text-white text-sm font-medium">{opt.label}</div>
                      <div className="text-slate-400 text-xs">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setShowGeneratePopover(null)}
                className="flex-1 px-4 py-3 bg-slate-700 text-slate-300 rounded-xl hover:bg-slate-600 transition-colors font-medium"
              >
                Annulla
              </button>
              <button
                onClick={handleGenerate}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:opacity-90 transition-opacity font-semibold"
              >
                Genera {generateCount}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => !deleting && setShowDeleteModal(null)}
          />
          {/* Modal */}
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 bg-slate-800 rounded-2xl border border-red-500/30 shadow-2xl z-50 p-6 animate-fadeIn">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h4 className="text-white font-semibold text-lg">Conferma eliminazione</h4>
                <p className="text-slate-400 text-sm">Questa azione non può essere annullata</p>
              </div>
            </div>

            <div className="bg-slate-900 rounded-xl p-4 mb-6">
              {showDeleteModal.type === "flashcards" ? (
                <p className="text-slate-300">
                  Stai per eliminare <span className="text-red-400 font-semibold">tutte le flashcard</span> di questo capitolo, inclusi i progressi di studio.
                </p>
              ) : (
                <p className="text-slate-300">
                  Stai per eliminare il quiz <span className="text-red-400 font-semibold">"{showDeleteModal.quizTitle}"</span> e tutte le sue domande.
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(null)}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-slate-700 text-slate-300 rounded-xl hover:bg-slate-600 transition-colors font-medium disabled:opacity-50"
              >
                Annulla
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Eliminando...
                  </>
                ) : (
                  "Elimina"
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

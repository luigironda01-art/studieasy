"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter, Quiz } from "@/lib/supabase";
import Link from "next/link";

export default function SourceDetailPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const sourceId = params.id as string;
  const selectedChapterId = searchParams.get("chapter");

  const [source, setSource] = useState<Source | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Content viewer modal state
  const [viewingChapter, setViewingChapter] = useState<Chapter | null>(null);
  const [processingChapterId, setProcessingChapterId] = useState<string | null>(null);
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [generatingFlashcardsId, setGeneratingFlashcardsId] = useState<string | null>(null);
  const [generatingQuizId, setGeneratingQuizId] = useState<string | null>(null);
  const [flashcardCounts, setFlashcardCounts] = useState<Record<string, number>>({});
  const [quizCounts, setQuizCounts] = useState<Record<string, number>>({});
  const [chapterQuizzes, setChapterQuizzes] = useState<Record<string, Quiz[]>>({});
  const [showQuizList, setShowQuizList] = useState<string | null>(null);
  const quizListRef = useRef<HTMLDivElement>(null);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState<{
    type: "source" | "chapter" | "flashcards" | "quiz";
    id: string;
    title: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Rename state
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  // Generation modal state
  const [showGenerateModal, setShowGenerateModal] = useState<{
    chapterId: string;
    chapterTitle: string;
    type: "flashcards" | "quiz";
  } | null>(null);
  const [generateCount, setGenerateCount] = useState(10);
  const [generateDifficulty, setGenerateDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const generateModalRef = useRef<HTMLDivElement>(null);

  // Set breadcrumb
  useBreadcrumb(
    source
      ? [
          { label: "I miei libri", href: "/dashboard" },
          { label: source.title },
        ]
      : [{ label: "I miei libri", href: "/dashboard" }]
  );

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user && sourceId) {
      fetchSourceDetails();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading, sourceId]);

  // Auto-open chapter content viewer when chapter param is present
  useEffect(() => {
    if (selectedChapterId && chapters.length > 0) {
      const chapter = chapters.find(c => c.id === selectedChapterId);
      if (chapter) {
        setViewingChapter(chapter);
      }
    }
  }, [selectedChapterId, chapters]);

  const fetchSourceDetails = async () => {
    setLoading(true);
    setError("");

    try {
      const { data: sourceData, error: sourceError } = await supabase
        .from("sources")
        .select("*")
        .eq("id", sourceId)
        .single();

      if (sourceError) throw sourceError;
      setSource(sourceData);

      const { data: chaptersData, error: chaptersError } = await supabase
        .from("chapters")
        .select("*")
        .eq("source_id", sourceId)
        .order("order_index", { ascending: true });

      if (chaptersError) throw chaptersError;
      console.log("Chapters loaded:", chaptersData);
      setChapters(chaptersData || []);
    } catch (err) {
      console.error("Error fetching source:", err);
      setError("Errore nel caricamento della fonte");
    } finally {
      setLoading(false);
    }
  };

  // Fetch flashcard counts for each chapter
  const fetchFlashcardCounts = async () => {
    if (!user) return;

    const counts: Record<string, number> = {};
    for (const chapter of chapters) {
      const { count } = await supabase
        .from("flashcards")
        .select("*", { count: "exact", head: true })
        .eq("chapter_id", chapter.id)
        .eq("user_id", user.id);
      counts[chapter.id] = count || 0;
    }
    setFlashcardCounts(counts);
  };

  // Fetch quiz counts for each chapter
  const fetchQuizCounts = async () => {
    if (!user) return;

    const counts: Record<string, number> = {};
    for (const chapter of chapters) {
      const { count } = await supabase
        .from("quizzes")
        .select("*", { count: "exact", head: true })
        .eq("chapter_id", chapter.id)
        .eq("user_id", user.id);
      counts[chapter.id] = count || 0;
    }
    setQuizCounts(counts);
  };

  useEffect(() => {
    if (chapters.length > 0 && user) {
      fetchFlashcardCounts();
      fetchQuizCounts();

      // Auto-detect chapters already in processing state (e.g. after upload redirect)
      const processingChapter = chapters.find(c => c.processing_status === "processing");
      if (processingChapter && !processingChapterId) {
        setProcessingChapterId(processingChapter.id);
      }
    }
  }, [chapters, user]);

  // Poll for processing progress
  useEffect(() => {
    if (!processingChapterId) return;

    const pollProgress = async () => {
      try {
        const { data: chapter } = await supabase
          .from("chapters")
          .select("processing_status, processing_progress")
          .eq("id", processingChapterId)
          .single();

        if (chapter) {
          setProcessingProgress(chapter.processing_progress || 0);

          // Stop polling when completed or errored
          if (chapter.processing_status === "completed" || chapter.processing_status === "error") {
            setProcessingChapterId(null);
            setProcessingProgress(0);
            await fetchSourceDetails();
          }
        }
      } catch (err) {
        console.error("Error polling progress:", err);
      }
    };

    // Poll every 1 second
    const interval = setInterval(pollProgress, 1000);
    pollProgress(); // Initial poll

    return () => clearInterval(interval);
  }, [processingChapterId]);

  // Fetch quizzes for a specific chapter
  const fetchChapterQuizzes = async (chapterId: string) => {
    if (!user) return;

    const { data } = await supabase
      .from("quizzes")
      .select("*")
      .eq("chapter_id", chapterId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    setChapterQuizzes(prev => ({ ...prev, [chapterId]: data || [] }));
  };

  const handleQuizBadgeClick = async (chapterId: string) => {
    if (showQuizList === chapterId) {
      setShowQuizList(null);
    } else {
      if (!chapterQuizzes[chapterId]) {
        await fetchChapterQuizzes(chapterId);
      }
      setShowQuizList(chapterId);
    }
  };

  // Close quiz list when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (quizListRef.current && !quizListRef.current.contains(event.target as Node)) {
        setShowQuizList(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openGenerateModal = (chapterId: string, chapterTitle: string, type: "flashcards" | "quiz") => {
    setGenerateCount(10);
    setGenerateDifficulty("medium");
    setShowGenerateModal({ chapterId, chapterTitle, type });
  };

  const handleGenerateFlashcards = async (chapterId: string, count: number, difficulty: string) => {
    if (!user) return;

    setShowGenerateModal(null);
    setGeneratingFlashcardsId(chapterId);
    setError("");

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

      // Refresh flashcard counts
      await fetchFlashcardCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la generazione");
    } finally {
      setGeneratingFlashcardsId(null);
    }
  };

  const handleGenerateQuiz = async (chapterId: string, count: number, difficulty: string) => {
    if (!user) return;

    setShowGenerateModal(null);
    setGeneratingQuizId(chapterId);
    setError("");

    try {
      const response = await fetch("/api/quiz/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId,
          userId: user.id,
          numQuestions: count,
          difficulty,
          language: "it",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Generazione quiz fallita");
      }

      // Refresh quiz counts and redirect to quiz
      await fetchQuizCounts();
      router.push(`/dashboard/quiz/${data.quiz_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la generazione del quiz");
    } finally {
      setGeneratingQuizId(null);
    }
  };

  const handleGenerate = () => {
    if (!showGenerateModal) return;
    const { chapterId, type } = showGenerateModal;

    if (type === "flashcards") {
      handleGenerateFlashcards(chapterId, generateCount, generateDifficulty);
    } else if (type === "quiz") {
      handleGenerateQuiz(chapterId, generateCount, generateDifficulty);
    }
  };

  const handleProcess = async (chapter: Chapter) => {
    console.log("handleProcess called for chapter:", chapter.id, "file_url:", chapter.file_url);

    if (!chapter.file_url) {
      setError("Nessun file associato a questo capitolo");
      console.log("No file_url, returning early");
      return;
    }

    setProcessingChapterId(chapter.id);
    setError("");
    console.log("Calling Python backend for processing...");

    try {
      // Call Python backend for PDF processing
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/process/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_id: sourceId,
          chapter_id: chapter.id,
          pdf_url: chapter.file_url,
        }),
      });

      const data = await response.json();
      console.log("Backend response:", response.status, data);

      if (!response.ok) {
        throw new Error(data.error || data.detail || "Elaborazione fallita");
      }

      console.log("Processing successful, refreshing chapters...");
      // Refresh chapters to get updated status
      await fetchSourceDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'elaborazione");
      // Refresh to get actual status
      await fetchSourceDetails();
    } finally {
      setProcessingChapterId(null);
    }
  };

  const handleDeleteSource = async () => {
    if (!user || !source) return;

    setDeleting(true);
    setError("");

    try {
      // Get all chapters for this source
      const { data: chaptersData } = await supabase
        .from("chapters")
        .select("id")
        .eq("source_id", source.id);

      const chapterIds = chaptersData?.map(c => c.id) || [];

      if (chapterIds.length > 0) {
        // Get all flashcards for these chapters
        const { data: flashcardsData } = await supabase
          .from("flashcards")
          .select("id")
          .in("chapter_id", chapterIds);

        const flashcardIds = flashcardsData?.map(f => f.id) || [];

        // Delete reviews
        if (flashcardIds.length > 0) {
          await supabase.from("reviews").delete().in("flashcard_id", flashcardIds);
        }

        // Delete flashcards
        await supabase.from("flashcards").delete().in("chapter_id", chapterIds);

        // Delete quiz questions and quizzes
        const { data: quizzesData } = await supabase
          .from("quizzes")
          .select("id")
          .in("chapter_id", chapterIds);

        const quizIds = quizzesData?.map(q => q.id) || [];
        if (quizIds.length > 0) {
          await supabase.from("quiz_questions").delete().in("quiz_id", quizIds);
          await supabase.from("quizzes").delete().in("id", quizIds);
        }

        // Delete chapters
        await supabase.from("chapters").delete().eq("source_id", source.id);
      }

      // Delete the source
      const { error: deleteError } = await supabase
        .from("sources")
        .delete()
        .eq("id", source.id)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      // Redirect to dashboard
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione");
      setDeleting(false);
      setShowDeleteModal(null);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!user) return;

    setDeleting(true);
    setError("");

    try {
      // Get flashcards for this chapter
      const { data: flashcardsData } = await supabase
        .from("flashcards")
        .select("id")
        .eq("chapter_id", chapterId);

      const flashcardIds = flashcardsData?.map(f => f.id) || [];

      // Delete reviews
      if (flashcardIds.length > 0) {
        await supabase.from("reviews").delete().in("flashcard_id", flashcardIds);
      }

      // Delete flashcards
      await supabase.from("flashcards").delete().eq("chapter_id", chapterId);

      // Delete quiz questions and quizzes
      const { data: quizzesData } = await supabase
        .from("quizzes")
        .select("id")
        .eq("chapter_id", chapterId);

      const quizIds = quizzesData?.map(q => q.id) || [];
      if (quizIds.length > 0) {
        await supabase.from("quiz_questions").delete().in("quiz_id", quizIds);
        await supabase.from("quizzes").delete().in("id", quizIds);
      }

      // Delete the chapter
      const { error: deleteError } = await supabase
        .from("chapters")
        .delete()
        .eq("id", chapterId);

      if (deleteError) throw deleteError;

      setShowDeleteModal(null);
      await fetchSourceDetails();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteFlashcards = async (chapterId: string) => {
    if (!user) return;

    setDeleting(true);
    setError("");

    try {
      // Get flashcards for this chapter
      const { data: flashcardsData } = await supabase
        .from("flashcards")
        .select("id")
        .eq("chapter_id", chapterId)
        .eq("user_id", user.id);

      const flashcardIds = flashcardsData?.map(f => f.id) || [];

      // Delete reviews
      if (flashcardIds.length > 0) {
        await supabase.from("reviews").delete().in("flashcard_id", flashcardIds);
      }

      // Delete flashcards
      const { error: deleteError } = await supabase
        .from("flashcards")
        .delete()
        .eq("chapter_id", chapterId)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      setShowDeleteModal(null);
      await fetchFlashcardCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteQuiz = async (quizId: string) => {
    if (!user) return;

    setDeleting(true);
    setError("");

    try {
      // Delete quiz questions
      await supabase.from("quiz_questions").delete().eq("quiz_id", quizId);

      // Delete quiz
      const { error: deleteError } = await supabase
        .from("quizzes")
        .delete()
        .eq("id", quizId)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      setShowDeleteModal(null);
      await fetchQuizCounts();
      // Refresh chapter quizzes if visible
      const chapter = chapters.find(c => chapterQuizzes[c.id]?.some(q => q.id === quizId));
      if (chapter) {
        await fetchChapterQuizzes(chapter.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione");
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (!showDeleteModal) return;

    switch (showDeleteModal.type) {
      case "source":
        handleDeleteSource();
        break;
      case "chapter":
        handleDeleteChapter(showDeleteModal.id);
        break;
      case "flashcards":
        handleDeleteFlashcards(showDeleteModal.id);
        break;
      case "quiz":
        handleDeleteQuiz(showDeleteModal.id);
        break;
    }
  };

  const handleRenameSource = async () => {
    if (!user || !source || !newTitle.trim() || newTitle === source.title) {
      setEditingTitle(false);
      return;
    }

    setSavingTitle(true);
    try {
      const { error } = await supabase
        .from("sources")
        .update({ title: newTitle.trim() })
        .eq("id", source.id)
        .eq("user_id", user.id);

      if (error) throw error;
      setSource({ ...source, title: newTitle.trim() });
      setEditingTitle(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally {
      setSavingTitle(false);
    }
  };

  const startEditingTitle = () => {
    if (source) {
      setNewTitle(source.title);
      setEditingTitle(true);
    }
  };

  const getSourceIcon = () => {
    // Use topic emoji if available, otherwise fallback to type-based icon
    if (source?.topic_emoji) {
      return source.topic_emoji;
    }
    switch (source?.source_type) {
      case "book": return "📚";
      case "pdf": return "📄";
      case "notes": return "📝";
      default: return "📖";
    }
  };

  const getStatusBadge = (status: string, isProcessing: boolean, chapterId: string) => {
    if (isProcessing || (status === "processing" && processingChapterId === chapterId)) {
      const progress = processingProgress;
      return (
        <div className="flex items-center gap-3 min-w-[200px]">
          <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-blue-400 text-sm font-medium whitespace-nowrap">
            {progress}%
          </span>
        </div>
      );
    }
    switch (status) {
      case "completed":
        return <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">Completato</span>;
      case "processing":
        return (
          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full flex items-center gap-1">
            <span className="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin"></span>
            In elaborazione...
          </span>
        );
      case "error": {
        const chapter = chapters.find(c => c.id === chapterId);
        const errorNote = chapter?.extraction_notes || "Errore durante l'elaborazione";
        return (
          <span className="group relative px-2 py-1 bg-red-500/20 text-red-400 text-xs rounded-full cursor-help">
            Errore
            <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-slate-800 border border-red-500/30 rounded-xl text-xs text-red-300 shadow-xl z-50">
              {errorNote}
            </span>
          </span>
        );
      }
      default:
        return <span className="px-2 py-1 bg-slate-500/20 text-slate-400 text-xs rounded-full">In attesa</span>;
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-slate-400">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (error && !source) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="text-4xl">😕</span>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">
            {error || "Fonte non trovata"}
          </h2>
          <Link href="/dashboard" className="text-blue-400 hover:text-blue-300">
            ← Torna alla dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!source) return null;

  return (
    <div className="p-6 md:p-8">
      {/* Back button */}
      <div className="max-w-5xl mx-auto mb-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Torna ai libri
        </button>
      </div>

      {/* Source header */}
      <div className="max-w-5xl mx-auto mb-8">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 bg-slate-700 rounded-xl flex items-center justify-center text-3xl">
            {getSourceIcon()}
          </div>
          <div className="flex-1">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSource();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  className="text-2xl font-bold text-white bg-slate-700 border border-slate-600 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  onClick={handleRenameSource}
                  disabled={savingTitle}
                  className="p-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
                >
                  {savingTitle ? (
                    <span className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin inline-block"></span>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => setEditingTitle(false)}
                  className="p-2 bg-slate-700 text-slate-400 rounded-lg hover:bg-slate-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                onClick={startEditingTitle}
                className="text-2xl font-bold text-white hover:text-blue-400 transition-colors text-left flex items-center gap-2 group"
                title="Clicca per rinominare"
              >
                {source.title}
                <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            )}
            {source.author && (
              <p className="text-slate-400 mt-1">{source.author}</p>
            )}
            <p className="text-slate-500 text-sm mt-2">
              Aggiunto il {new Date(source.created_at).toLocaleDateString("it-IT")}
            </p>
          </div>
          <button
            onClick={() => setShowDeleteModal({
              type: "source",
              id: source.id,
              title: source.title
            })}
            className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 transition-colors flex items-center gap-2 text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Elimina
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto">
        {/* Error message */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Chapters section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Capitoli</h2>
          </div>

          {chapters.length === 0 ? (
            <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
              <div className="w-16 h-16 bg-slate-700 rounded-xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📑</span>
              </div>
              <h3 className="text-white font-medium mb-2">Nessun capitolo</h3>
              <p className="text-slate-400 text-sm">
                {source.source_type === "pdf"
                  ? "Il PDF è in attesa di elaborazione"
                  : "Aggiungi capitoli per iniziare a creare flashcard"
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {chapters.map((chapter, index) => (
                <div
                  key={chapter.id}
                  className="bg-slate-800 rounded-xl border border-slate-700 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-sm font-medium text-slate-400">
                        {index + 1}
                      </div>
                      <div>
                        <h3 className="text-white font-medium">{chapter.title}</h3>
                        {chapter.processing_status === "completed" && (
                          <p className="text-slate-400 text-sm mt-1">
                            {chapter.page_count
                              ? `${chapter.page_count} ${chapter.page_count === 1 ? 'pagina' : 'pagine'} elaborate`
                              : "Pronto per generare flashcard"
                            }
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(chapter.processing_status, processingChapterId === chapter.id, chapter.id)}

                      {chapter.processing_status === "pending" && (
                        chapter.file_url ? (
                          <button
                            onClick={() => handleProcess(chapter)}
                            disabled={processingChapterId !== null}
                            className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                          >
                            Elabora
                          </button>
                        ) : (
                          <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                            File mancante
                          </span>
                        )
                      )}

                      {chapter.processing_status === "error" && chapter.file_url && (
                        <button
                          onClick={() => handleProcess(chapter)}
                          disabled={processingChapterId !== null}
                          className="px-4 py-2 bg-red-500/20 text-red-400 text-sm rounded-lg font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                        >
                          Riprova
                        </button>
                      )}

                      {chapter.processing_status === "completed" && (
                        <div className="flex items-center gap-2">
                          {flashcardCounts[chapter.id] > 0 && (
                            <button
                              onClick={() => setShowDeleteModal({
                                type: "flashcards",
                                id: chapter.id,
                                title: `${flashcardCounts[chapter.id]} flashcard di "${chapter.title}"`
                              })}
                              className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full hover:bg-purple-500/30 transition-colors group flex items-center gap-1"
                            >
                              {flashcardCounts[chapter.id]} flashcard
                              <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                          {quizCounts[chapter.id] > 0 && (
                            <div className="relative" ref={showQuizList === chapter.id ? quizListRef : null}>
                              <button
                                onClick={() => handleQuizBadgeClick(chapter.id)}
                                className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full hover:bg-emerald-500/30 transition-colors cursor-pointer"
                              >
                                {quizCounts[chapter.id]} quiz ▾
                              </button>
                              {showQuizList === chapter.id && chapterQuizzes[chapter.id] && (
                                <div className="absolute top-full right-0 mt-2 w-64 bg-slate-700 rounded-xl border border-slate-600 shadow-xl z-10 overflow-hidden">
                                  <div className="p-2 border-b border-slate-600">
                                    <p className="text-xs text-slate-400 font-medium">Quiz precedenti</p>
                                  </div>
                                  <div className="max-h-48 overflow-y-auto">
                                    {chapterQuizzes[chapter.id].map((quiz) => (
                                      <Link
                                        key={quiz.id}
                                        href={`/dashboard/quiz/${quiz.id}`}
                                        className="block px-3 py-2 hover:bg-slate-600 transition-colors"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="text-white text-sm truncate">
                                            {new Date(quiz.created_at).toLocaleDateString("it-IT", {
                                              day: "numeric",
                                              month: "short",
                                              hour: "2-digit",
                                              minute: "2-digit"
                                            })}
                                          </span>
                                          {quiz.completed_at ? (
                                            <span className="text-emerald-400 text-xs">
                                              {quiz.score}/{quiz.total_questions}
                                            </span>
                                          ) : (
                                            <span className="text-yellow-400 text-xs">In corso</span>
                                          )}
                                        </div>
                                      </Link>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          <button
                            onClick={() => setViewingChapter(chapter)}
                            className="px-4 py-2 bg-slate-700 text-white text-sm rounded-lg font-medium hover:bg-slate-600 transition-colors flex items-center gap-2"
                          >
                            <span>📖</span>
                            Leggi
                          </button>
                          <button
                            onClick={() => openGenerateModal(chapter.id, chapter.title, "flashcards")}
                            disabled={generatingFlashcardsId !== null || generatingQuizId !== null}
                            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                          >
                            {generatingFlashcardsId === chapter.id ? (
                              <>
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                Generando...
                              </>
                            ) : (
                              <>
                                <span>🎴</span>
                                Flashcard
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => openGenerateModal(chapter.id, chapter.title, "quiz")}
                            disabled={generatingFlashcardsId !== null || generatingQuizId !== null}
                            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                          >
                            {generatingQuizId === chapter.id ? (
                              <>
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                Generando...
                              </>
                            ) : (
                              <>
                                <span>📝</span>
                                Quiz
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setShowDeleteModal({
                              type: "chapter",
                              id: chapter.id,
                              title: chapter.title
                            })}
                            className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                            title="Elimina capitolo"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info card */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-white font-semibold mb-4">Informazioni</h3>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Tipo</dt>
              <dd className="text-white capitalize">{source.source_type}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Creato</dt>
              <dd className="text-white">
                {new Date(source.created_at).toLocaleDateString("it-IT", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </dd>
            </div>
          </dl>

          {/* Extraction details - only show when processing is completed */}
          {chapters.some(c => c.processing_status === "completed") && (
            <>
              <hr className="border-slate-700 my-4" />
              <h4 className="text-white font-medium mb-3 flex items-center gap-2">
                <span className="text-green-400">✓</span>
                Elaborazione completata
              </h4>
              <dl className="space-y-3 text-sm">
                {/* Total pages */}
                {(() => {
                  const totalPages = chapters
                    .filter(c => c.processing_status === "completed")
                    .reduce((sum, c) => sum + (c.page_count || 0), 0);
                  return totalPages > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Pagine rilevate</dt>
                      <dd className="text-white font-medium">{totalPages}</dd>
                    </div>
                  );
                })()}

                {/* Total characters extracted */}
                {(() => {
                  const totalChars = chapters
                    .filter(c => c.processing_status === "completed")
                    .reduce((sum, c) => sum + (c.chars_extracted || 0), 0);
                  return totalChars > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Caratteri estratti</dt>
                      <dd className="text-white font-medium">
                        {totalChars > 1000
                          ? `${(totalChars / 1000).toFixed(1)}k`
                          : totalChars}
                      </dd>
                    </div>
                  );
                })()}

                {/* Extraction method breakdown */}
                {(() => {
                  const completedChapters = chapters.filter(c => c.processing_status === "completed");
                  const methods = {
                    text: completedChapters.filter(c => c.extraction_method === "text").length,
                    vision: completedChapters.filter(c => c.extraction_method === "vision").length,
                    hybrid: completedChapters.filter(c => c.extraction_method === "hybrid").length,
                  };

                  return (
                    <div className="flex justify-between items-start">
                      <dt className="text-slate-400">Metodo estrazione</dt>
                      <dd className="text-right">
                        {methods.text > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs mr-1">
                            📝 Testo: {methods.text}
                          </span>
                        )}
                        {methods.vision > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs mr-1">
                            👁 Vision AI: {methods.vision}
                          </span>
                        )}
                        {methods.hybrid > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                            🔀 Ibrido: {methods.hybrid}
                          </span>
                        )}
                      </dd>
                    </div>
                  );
                })()}

                {/* Average extraction quality */}
                {(() => {
                  const completedWithQuality = chapters.filter(
                    c => c.processing_status === "completed" && c.extraction_quality !== null
                  );
                  if (completedWithQuality.length === 0) return null;

                  const avgQuality = Math.round(
                    completedWithQuality.reduce((sum, c) => sum + (c.extraction_quality || 0), 0) /
                    completedWithQuality.length
                  );

                  let qualityColor = "text-green-400";
                  let qualityLabel = "Eccellente";
                  if (avgQuality < 50) {
                    qualityColor = "text-red-400";
                    qualityLabel = "Parziale";
                  } else if (avgQuality < 80) {
                    qualityColor = "text-amber-400";
                    qualityLabel = "Buono";
                  }

                  return (
                    <div className="flex justify-between">
                      <dt className="text-slate-400">Qualità estrazione</dt>
                      <dd className={`font-medium ${qualityColor}`}>
                        {avgQuality}% - {qualityLabel}
                      </dd>
                    </div>
                  );
                })()}

                {/* Extraction notes/warnings */}
                {(() => {
                  const notes = chapters
                    .filter(c => c.processing_status === "completed" && c.extraction_notes)
                    .map(c => c.extraction_notes);

                  return notes.length > 0 && (
                    <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <p className="text-amber-400 text-xs font-medium mb-1">⚠️ Note estrazione:</p>
                      {notes.map((note, i) => (
                        <p key={i} className="text-amber-300/80 text-xs">{note}</p>
                      ))}
                    </div>
                  );
                })()}
              </dl>
            </>
          )}

          {/* Processing in progress indicator */}
          {chapters.some(c => c.processing_status === "processing") && (
            <>
              <hr className="border-slate-700 my-4" />
              {processingChapterId ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-blue-400 font-medium">Elaborazione in corso...</span>
                    <span className="text-blue-400 font-medium">{processingProgress}%</span>
                  </div>
                  <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500 ease-out"
                      style={{ width: `${processingProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-blue-400">
                  <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                  <span className="text-sm">Elaborazione in corso...</span>
                </div>
              )}
            </>
          )}

          {/* Error indicator with details */}
          {chapters.some(c => c.processing_status === "error") && (
            <>
              <hr className="border-slate-700 my-4" />
              {chapters.filter(c => c.processing_status === "error").map(ch => (
                <div key={ch.id} className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                  <div className="flex items-center gap-2 text-red-400 mb-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium">Elaborazione fallita</span>
                  </div>
                  <p className="text-red-300/80 text-xs mb-3">
                    {ch.extraction_notes || "Si è verificato un errore durante l'elaborazione del documento."}
                  </p>
                  <button
                    onClick={() => handleProcess(ch)}
                    className="text-xs px-3 py-1.5 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-colors"
                  >
                    Riprova elaborazione
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Generation Modal */}
      {showGenerateModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowGenerateModal(null)}
          />
          {/* Modal */}
          <div
            ref={generateModalRef}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl z-50 p-6 animate-fadeIn"
          >
            <h4 className="text-white font-semibold text-lg mb-2">
              {showGenerateModal.type === "flashcards" ? "Genera Flashcard" : "Genera Quiz"}
            </h4>
            <p className="text-slate-400 text-sm mb-5">
              {showGenerateModal.chapterTitle}
            </p>

            {/* Quantity */}
            <div className="mb-5">
              <label className="text-slate-400 text-sm mb-2 block">
                {showGenerateModal.type === "flashcards" ? "Numero flashcard" : "Numero domande"}
              </label>
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

            {/* Difficulty */}
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

            <div className="flex gap-3">
              <button
                onClick={() => setShowGenerateModal(null)}
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
              {showDeleteModal.type === "source" && (
                <p className="text-slate-300">
                  Stai per eliminare <span className="text-red-400 font-semibold">"{showDeleteModal.title}"</span> e tutti i suoi capitoli, flashcard, quiz e progressi di studio.
                </p>
              )}
              {showDeleteModal.type === "chapter" && (
                <p className="text-slate-300">
                  Stai per eliminare il capitolo <span className="text-red-400 font-semibold">"{showDeleteModal.title}"</span> e tutte le flashcard e quiz associati.
                </p>
              )}
              {showDeleteModal.type === "flashcards" && (
                <p className="text-slate-300">
                  Stai per eliminare <span className="text-red-400 font-semibold">{showDeleteModal.title}</span> e i relativi progressi di studio.
                </p>
              )}
              {showDeleteModal.type === "quiz" && (
                <p className="text-slate-300">
                  Stai per eliminare il quiz <span className="text-red-400 font-semibold">"{showDeleteModal.title}"</span> e tutte le sue domande.
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

      {/* Chapter Content Viewer Modal */}
      {viewingChapter && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
            onClick={() => {
              setViewingChapter(null);
              router.push(`/dashboard/source/${sourceId}`);
            }}
          />
          {/* Modal */}
          <div className="fixed inset-4 md:inset-8 lg:inset-16 bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl z-50 flex flex-col animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
              <div>
                <h3 className="text-white font-semibold text-lg">{viewingChapter.title}</h3>
                <p className="text-slate-400 text-sm">{source?.title}</p>
              </div>
              <button
                onClick={() => {
                  setViewingChapter(null);
                  router.push(`/dashboard/source/${sourceId}`);
                }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {viewingChapter.processed_text ? (
                <div className="prose prose-invert prose-slate max-w-none">
                  <div
                    className="whitespace-pre-wrap text-slate-300 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: viewingChapter.processed_text
                        .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-white mt-6 mb-3">$1</h1>')
                        .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold text-white mt-5 mb-2">$1</h2>')
                        .replace(/^### (.*$)/gm, '<h3 class="text-lg font-medium text-white mt-4 mb-2">$1</h3>')
                        .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
                        .replace(/\*(.*?)\*/g, '<em>$1</em>')
                        .replace(/^- (.*$)/gm, '<li class="ml-4">$1</li>')
                        .replace(/\n\n/g, '</p><p class="mb-4">')
                    }}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <span className="text-3xl">📄</span>
                  </div>
                  <h4 className="text-white font-medium mb-2">Contenuto non disponibile</h4>
                  <p className="text-slate-400 text-sm max-w-md">
                    Il documento non è stato ancora elaborato o il contenuto non è stato estratto correttamente.
                    Prova a rielaborare il capitolo.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

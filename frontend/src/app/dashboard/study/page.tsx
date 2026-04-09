"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter, Quiz } from "@/lib/supabase";
import { renderLatexInText } from "@/lib/latex";
import Link from "next/link";

// Batch of flashcards grouped by difficulty and batch_id
interface FlashcardBatch {
  batch_id: string | null;
  count: number;
  dueCount: number;
  created_at: string;
}

// Flashcards grouped by difficulty
interface FlashcardsByDifficulty {
  easy: FlashcardBatch[];
  medium: FlashcardBatch[];
  hard: FlashcardBatch[];
}

interface SourceWithContent extends Source {
  chapters: ChapterWithContent[];
  // Aggregated flashcard data by difficulty
  flashcardsByDifficulty: FlashcardsByDifficulty;
  totalFlashcards: number;
  totalDue: number;
}

interface Summary {
  id: string;
  chapter_id: string;
  user_id: string;
  content: string;
  word_count: number;
  target_words: number;
  created_at: string;
}

interface AIFocusData {
  main_topic: string;
  subtopics: string[];
  concepts_to_explore: { concept: string; why: string }[];
  search_queries: { query: string; purpose: string; type: string }[];
  study_tips: string[];
}

interface ChapterWithContent extends Chapter {
  flashcardCount: number;
  dueCount: number;
  quizzes: Quiz[];
  summary: Summary | null;
}

type TabType = "flashcards" | "quiz" | "summaries" | "ai-focus" | "maps" | "presentations" | "infographics";

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
  { id: "summaries" as TabType, label: "Riassunti", icon: "📄", available: true, description: "Riassunti AI dei capitoli" },
  { id: "maps" as TabType, label: "Mappe", icon: "🗺️", available: true, description: "Mappe concettuali visive" },
  { id: "presentations" as TabType, label: "Slides", icon: "🎬", available: true, description: "Presentazioni generate" },
  { id: "infographics" as TabType, label: "Infografiche", icon: "📊", available: true, description: "Visualizzazioni grafiche dei concetti" },
  { id: "ai-focus" as TabType, label: "AI Guida", icon: "🧭", available: true, description: "Percorso di studio e risorse suggerite dall'AI" },
];

const GENERATION_LABELS: Record<TabType, string> = {
  flashcards: "flashcard",
  quiz: "domande",
  summaries: "parole (x50)",
  "ai-focus": "suggerimenti",
  maps: "nodi",
  presentations: "slide",
  infographics: "sezioni",
};

export default function StudyHubPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const popoverRef = useRef<HTMLDivElement>(null);

  const [sources, setSources] = useState<SourceWithContent[]>([]);
  const [selectedTool, setSelectedTool] = useState<TabType>("flashcards");
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [expandedDifficulties, setExpandedDifficulties] = useState<Set<string>>(new Set());
  const [batchSortBy, setBatchSortBy] = useState<'date' | 'count'>('date');
  const [isLoading, setIsLoading] = useState(true);
  const [totalDue, setTotalDue] = useState(0);

  // Coach AI state
  const [coachSuggestion, setCoachSuggestion] = useState<{
    message: string;
    actions: Array<{ label: string; type: string; chapterId: string; chapterTitle: string }>;
    insight?: string;
  } | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const [generatingFlashcardsId, setGeneratingFlashcardsId] = useState<string | null>(null);
  const [generatingQuizId, setGeneratingQuizId] = useState<string | null>(null);
  const [generatingSummaryId, setGeneratingSummaryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Summary reader modal
  const [showSummaryReader, setShowSummaryReader] = useState<Summary | null>(null);

  // AI Focus state
  const [generatingFocusId, setGeneratingFocusId] = useState<string | null>(null);
  const [aiFocusData, setAiFocusData] = useState<Record<string, AIFocusData>>({});
  const [showFocusModal, setShowFocusModal] = useState<{ chapterId: string; chapterTitle: string } | null>(null);

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
      // First fetch sources (needed to filter chapters)
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

      const sourceIds = sourcesData.map(s => s.id);
      const now = new Date().toISOString();

      // Run all independent queries in PARALLEL (was 5+ sequential = N+1 problem)
      const [
        { data: chaptersData },
        { data: flashcardsData },
        { data: dueReviewsRaw },
        { data: quizzesData },
        { data: summariesData },
      ] = await Promise.all([
        supabase.from("chapters").select("*").in("source_id", sourceIds).order("order_index", { ascending: true }),
        supabase.from("flashcards").select("id, chapter_id, difficulty, batch_id, created_at").eq("user_id", user.id),
        supabase.from("reviews").select("id, flashcard_id, flashcards!inner(chapter_id)").eq("user_id", user.id).lte("due", now),
        supabase.from("quizzes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("summaries").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      ]);
      const dueReviews = dueReviewsRaw;

      // Get source_id for each chapter for grouping
      const chapterToSource: Record<string, string> = {};
      chaptersData?.forEach((c: any) => {
        chapterToSource[c.id] = c.source_id;
      });

      const fcCountByChapter: Record<string, number> = {};
      flashcardsData?.forEach((fc: any) => {
        fcCountByChapter[fc.chapter_id] = (fcCountByChapter[fc.chapter_id] || 0) + 1;
      });

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

      const quizzesByChapter: Record<string, Quiz[]> = {};
      quizzesData?.forEach((quiz: Quiz) => {
        if (!quizzesByChapter[quiz.chapter_id]) {
          quizzesByChapter[quiz.chapter_id] = [];
        }
        quizzesByChapter[quiz.chapter_id].push(quiz);
      });

      const summaryByChapter: Record<string, Summary> = {};
      summariesData?.forEach((summary: Summary) => {
        // Keep only the most recent summary per chapter
        if (!summaryByChapter[summary.chapter_id]) {
          summaryByChapter[summary.chapter_id] = summary;
        }
      });

      // Group flashcards by source -> difficulty -> batch
      const flashcardsBySource: Record<string, FlashcardsByDifficulty> = {};
      const dueByFlashcardId: Set<string> = new Set();

      // Build set of due flashcard IDs
      dueReviews?.forEach((r: any) => {
        if (r.flashcards?.chapter_id) {
          // We need flashcard_id, get it from the join
          const flashcardId = (r as any).flashcard_id;
          if (flashcardId) dueByFlashcardId.add(flashcardId);
        }
      });

      // Group flashcards
      flashcardsData?.forEach((fc: any) => {
        const sourceId = chapterToSource[fc.chapter_id];
        if (!sourceId) return;

        if (!flashcardsBySource[sourceId]) {
          flashcardsBySource[sourceId] = {
            easy: [],
            medium: [],
            hard: []
          };
        }

        const difficulty = (fc.difficulty || 'medium') as 'easy' | 'medium' | 'hard';
        const batchId = fc.batch_id || 'legacy';

        // Find or create batch
        let batch = flashcardsBySource[sourceId][difficulty].find(b => b.batch_id === batchId);
        if (!batch) {
          batch = {
            batch_id: batchId,
            count: 0,
            dueCount: 0,
            created_at: fc.created_at
          };
          flashcardsBySource[sourceId][difficulty].push(batch);
        }

        batch.count++;
        // Check if this flashcard is due (simplified - we track by chapter for now)
        if (dueByChapter[fc.chapter_id] > 0) {
          // Approximate due count distribution
          batch.dueCount++;
        }
      });

      // Sort batches by date (newest first)
      Object.values(flashcardsBySource).forEach(byDiff => {
        (['easy', 'medium', 'hard'] as const).forEach(diff => {
          byDiff[diff].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
      });

      // Combine data
      const sourcesWithContent: SourceWithContent[] = sourcesData.map(source => {
        const sourceChapters = (chaptersData || [])
          .filter(c => c.source_id === source.id)
          .map(chapter => ({
            ...chapter,
            flashcardCount: fcCountByChapter[chapter.id] || 0,
            dueCount: dueByChapter[chapter.id] || 0,
            summary: summaryByChapter[chapter.id] || null,
            quizzes: quizzesByChapter[chapter.id] || [],
          }));

        const flashcardsByDifficulty = flashcardsBySource[source.id] || {
          easy: [],
          medium: [],
          hard: []
        };

        const totalFlashcards =
          flashcardsByDifficulty.easy.reduce((acc, b) => acc + b.count, 0) +
          flashcardsByDifficulty.medium.reduce((acc, b) => acc + b.count, 0) +
          flashcardsByDifficulty.hard.reduce((acc, b) => acc + b.count, 0);

        const totalSourceDue = sourceChapters.reduce((acc, c) => acc + c.dueCount, 0);

        return {
          ...source,
          chapters: sourceChapters,
          flashcardsByDifficulty,
          totalFlashcards,
          totalDue: totalSourceDue,
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

  // Fetch coach suggestion
  const fetchCoachSuggestion = async () => {
    if (!user || coachLoading) return;
    setCoachLoading(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setCoachSuggestion(data.suggestion);
      }
    } catch (err) {
      console.error("Coach error:", err);
    } finally {
      setCoachLoading(false);
    }
  };

  // Load coach on mount (after main data)
  useEffect(() => {
    if (!isLoading && user && !coachSuggestion && !coachDismissed) {
      fetchCoachSuggestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user]);

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

  const handleGenerateSummary = async (chapterId: string, targetWords: number) => {
    if (!user) return;

    setShowGeneratePopover(null);
    setGeneratingSummaryId(chapterId);
    setError(null);

    try {
      const response = await fetch("/api/summaries/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId,
          userId: user.id,
          targetWords,
          language: "it",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Generazione riassunto fallita");
      }

      // Refresh content to show new summary
      await fetchContent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la generazione del riassunto");
    } finally {
      setGeneratingSummaryId(null);
    }
  };

  const handleGenerateAIFocus = async (chapterId: string, chapterTitle: string) => {
    if (!user) return;

    setGeneratingFocusId(chapterId);
    setError(null);

    try {
      const response = await fetch("/api/ai-focus/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId,
          userId: user.id,
          language: "it",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Generazione AI Focus fallita");
      }

      // Store the focus data
      setAiFocusData(prev => ({
        ...prev,
        [chapterId]: data.focus
      }));

      // Open the modal to show results
      setShowFocusModal({ chapterId, chapterTitle });

    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante la generazione AI Focus");
    } finally {
      setGeneratingFocusId(null);
    }
  };

  const handleDeleteSummary = async (summaryId: string) => {
    if (!user) return;

    setDeleting(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("summaries")
        .delete()
        .eq("id", summaryId)
        .eq("user_id", user.id);

      if (deleteError) throw deleteError;

      await fetchContent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione del riassunto");
    } finally {
      setDeleting(false);
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
    } else if (type === "summaries") {
      // For summaries, generateCount represents target words (multiplied by 50 for word count)
      handleGenerateSummary(chapterId, generateCount * 50);
    }
    // Future: maps, presentations
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

  const toggleDifficulty = (sourceId: string, difficulty: string) => {
    const key = `${sourceId}-${difficulty}`;
    setExpandedDifficulties(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleDeleteBatch = async (batchId: string | null) => {
    if (!user) return;

    setDeleting(true);
    setError(null);

    try {
      // Get all flashcards in this batch
      let query = supabase
        .from("flashcards")
        .select("id")
        .eq("user_id", user.id);

      if (batchId === 'legacy' || batchId === null) {
        query = query.is("batch_id", null);
      } else {
        query = query.eq("batch_id", batchId);
      }

      const { data: flashcards } = await query;

      if (flashcards && flashcards.length > 0) {
        const flashcardIds = flashcards.map(f => f.id);

        // Delete reviews first
        await supabase
          .from("reviews")
          .delete()
          .in("flashcard_id", flashcardIds);

        // Delete flashcards
        await supabase
          .from("flashcards")
          .delete()
          .in("id", flashcardIds);
      }

      setShowDeleteModal(null);
      await fetchContent();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione");
    } finally {
      setDeleting(false);
    }
  };

  const sortBatches = (batches: FlashcardBatch[]) => {
    return [...batches].sort((a, b) => {
      if (batchSortBy === 'count') {
        return b.count - a.count;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  };

  const formatBatchDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getDifficultyConfig = (difficulty: 'easy' | 'medium' | 'hard') => {
    const configs = {
      easy: { emoji: '🟢', label: 'Facile', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30' },
      medium: { emoji: '🟡', label: 'Media', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
      hard: { emoji: '🔴', label: 'Difficile', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' }
    };
    return configs[difficulty];
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
              data-tutorial="study-start"
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
            >
              <span>🎯</span>
              <span>Ripassa tutto ({totalDue})</span>
            </Link>
          )}
        </div>

        {/* Coach AI Card */}
        {!coachDismissed && (coachLoading || coachSuggestion) && (
          <div data-tutorial="study-coach" className="mb-6 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-purple-500/20 rounded-2xl p-5 relative">
            {coachLoading ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                  <span className="text-lg">🧠</span>
                </div>
                <div className="flex-1">
                  <div className="h-4 w-48 bg-white/10 rounded animate-pulse mb-2" />
                  <div className="h-3 w-72 bg-white/5 rounded animate-pulse" />
                </div>
              </div>
            ) : coachSuggestion && (
              <>
                {/* Dismiss button */}
                <button
                  onClick={() => setCoachDismissed(true)}
                  className="absolute top-3 right-3 p-1 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-lg">🧠</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-semibold text-sm mb-1">Il tuo Coach</h3>
                    <p className="text-slate-300 text-sm leading-relaxed mb-3">
                      {coachSuggestion.message}
                    </p>

                    {/* Insight */}
                    {coachSuggestion.insight && (
                      <p className="text-slate-400 text-xs mb-3 italic">
                        💡 {coachSuggestion.insight}
                      </p>
                    )}

                    {/* Action buttons */}
                    {coachSuggestion.actions && coachSuggestion.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {coachSuggestion.actions.map((action, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              if (action.type === "flashcards") {
                                router.push("/dashboard/study/session");
                              } else if (action.type === "quiz") {
                                setSelectedTool("quiz");
                              } else if (action.type === "summary") {
                                setSelectedTool("summaries");
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-xs font-medium text-white transition-colors"
                          >
                            <span>
                              {action.type === "flashcards" ? "🔥" : action.type === "quiz" ? "📝" : "📖"}
                            </span>
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tools Tabs */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-2 mb-6" data-tutorial="study-due">
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
                  {selectedTool === "summaries" && (
                    <span className="text-emerald-400 text-sm">
                      {source.chapters.filter(c => c.summary !== null).length}/{source.chapters.length} riassunti
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

              {/* Expanded Content */}
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
                  ) : selectedTool === "flashcards" ? (
                    /* FLASHCARDS: Difficulty-based accordion */
                    <div className="p-4 space-y-3">
                      {/* Sort Toggle */}
                      {source.totalFlashcards > 0 && (
                        <div className="flex items-center justify-end gap-2 mb-2">
                          <span className="text-slate-500 text-xs">Ordina per:</span>
                          <button
                            onClick={() => setBatchSortBy('date')}
                            className={`px-2 py-1 text-xs rounded ${
                              batchSortBy === 'date'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Data
                          </button>
                          <button
                            onClick={() => setBatchSortBy('count')}
                            className={`px-2 py-1 text-xs rounded ${
                              batchSortBy === 'count'
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Quantità
                          </button>
                        </div>
                      )}

                      {/* Difficulty Sections */}
                      {(['easy', 'medium', 'hard'] as const).map((difficulty) => {
                        const config = getDifficultyConfig(difficulty);
                        const batches = sortBatches(source.flashcardsByDifficulty[difficulty]);
                        const totalCards = batches.reduce((acc, b) => acc + b.count, 0);
                        const isExpanded = expandedDifficulties.has(`${source.id}-${difficulty}`);

                        return (
                          <div
                            key={difficulty}
                            className={`rounded-xl border ${config.border} ${config.bg} overflow-hidden`}
                          >
                            {/* Difficulty Header */}
                            <button
                              onClick={() => toggleDifficulty(source.id, difficulty)}
                              className="w-full flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{config.emoji}</span>
                                <span className={`font-medium ${config.color}`}>{config.label}</span>
                                <span className="text-slate-500 text-sm">
                                  ({totalCards} {totalCards === 1 ? 'carta' : 'carte'})
                                </span>
                              </div>
                              <svg
                                className={`w-4 h-4 text-slate-400 transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>

                            {/* Batches List */}
                            {isExpanded && (
                              <div className="border-t border-slate-700/50">
                                {batches.length === 0 ? (
                                  <div className="p-4 text-center text-slate-500 text-sm">
                                    Nessuna carta {config.label.toLowerCase()}
                                  </div>
                                ) : (
                                  <div className="divide-y divide-slate-700/30">
                                    {batches.map((batch, idx) => (
                                      <div
                                        key={batch.batch_id || `legacy-${idx}`}
                                        className="flex items-center justify-between p-3 hover:bg-white/5 transition-colors"
                                      >
                                        <div className="flex items-center gap-3">
                                          <span className="text-white font-medium">
                                            {batch.count} {batch.count === 1 ? 'carta' : 'carte'}
                                          </span>
                                          <span className="text-slate-500 text-sm">
                                            {batch.batch_id === 'legacy' || !batch.batch_id
                                              ? 'Legacy'
                                              : formatBatchDate(batch.created_at)}
                                          </span>
                                          {batch.dueCount > 0 && (
                                            <span className="text-orange-400 text-xs bg-orange-500/10 px-2 py-0.5 rounded-full">
                                              {batch.dueCount} da ripassare
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {batch.dueCount > 0 && (
                                            <Link
                                              href={`/dashboard/study/session?batch=${batch.batch_id || 'legacy'}`}
                                              className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded-lg hover:bg-blue-600 transition-colors"
                                            >
                                              Ripassa
                                            </Link>
                                          )}
                                          <button
                                            onClick={() => handleDeleteBatch(batch.batch_id)}
                                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                            title="Elimina batch"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Generate Flashcards - Chapter Selection */}
                      {source.chapters.some(c => c.processing_status === "completed") && (
                        <div className="mt-4 pt-4 border-t border-slate-700/50">
                          <p className="text-slate-400 text-sm mb-3">Genera nuove flashcard:</p>
                          <div className="flex flex-wrap gap-2">
                            {source.chapters
                              .filter(c => c.processing_status === "completed")
                              .map((chapter) => (
                                <button
                                  key={chapter.id}
                                  onClick={() => openGeneratePopover(chapter.id, "flashcards")}
                                  disabled={generatingFlashcardsId !== null}
                                  className="px-3 py-1.5 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                  {generatingFlashcardsId === chapter.id ? (
                                    <>
                                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                      Generando...
                                    </>
                                  ) : (
                                    <>
                                      <span>+</span>
                                      {chapter.title}
                                    </>
                                  )}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : selectedTool === "quiz" ? (
                    /* QUIZ: Chapter-based display */
                    <div className="divide-y divide-slate-700/50">
                      {source.chapters.map((chapter) => (
                        <div key={chapter.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="text-white font-medium">{chapter.title}</h4>
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
                            </div>

                            {/* Quiz Generate Button */}
                            {chapter.processing_status === "completed" && (
                              <button
                                onClick={() => openGeneratePopover(chapter.id, "quiz")}
                                disabled={generatingFlashcardsId !== null || generatingQuizId !== null}
                                className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-600 text-white text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2 ml-4"
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
                      ))}
                    </div>
                  ) : selectedTool === "summaries" ? (
                    /* SUMMARIES: Chapter-based display */
                    <div className="divide-y divide-slate-700/50">
                      {source.chapters.map((chapter) => (
                        <div key={chapter.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="text-white font-medium">{chapter.title}</h4>
                              <div className="mt-2">
                                {chapter.summary ? (
                                  <div className="flex items-center gap-3">
                                    <span className="text-green-400 text-sm flex items-center gap-1">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Riassunto disponibile
                                    </span>
                                    <span className="text-slate-500 text-sm">
                                      {chapter.summary.word_count} parole
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-500 text-sm">Nessun riassunto</span>
                                )}
                              </div>
                            </div>

                            {/* Summary Actions */}
                            <div className="flex items-center gap-2 ml-4">
                              {chapter.summary ? (
                                <>
                                  <button
                                    onClick={() => setShowSummaryReader(chapter.summary)}
                                    className="px-3 py-1.5 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    Leggi
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSummary(chapter.summary!.id)}
                                    disabled={deleting}
                                    className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                                    title="Elimina riassunto"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() => openGeneratePopover(chapter.id, "summaries")}
                                    disabled={generatingSummaryId !== null}
                                    className="px-3 py-1.5 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600 transition-colors"
                                    title="Rigenera riassunto"
                                  >
                                    🔄
                                  </button>
                                </>
                              ) : chapter.processing_status === "completed" ? (
                                <button
                                  onClick={() => openGeneratePopover(chapter.id, "summaries")}
                                  disabled={generatingSummaryId !== null}
                                  className="px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                                >
                                  {generatingSummaryId === chapter.id ? (
                                    <>
                                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                      Generando...
                                    </>
                                  ) : (
                                    "+ Genera Riassunto"
                                  )}
                                </button>
                              ) : (
                                <span className="text-slate-500 text-sm">Capitolo non elaborato</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : selectedTool === "ai-focus" ? (
                    /* AI FOCUS: Chapter-based display */
                    <div className="divide-y divide-slate-700/50">
                      {source.chapters.map((chapter) => (
                        <div key={chapter.id} className="p-4 hover:bg-slate-700/30 transition-colors">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="text-white font-medium">{chapter.title}</h4>
                              <div className="mt-2">
                                {aiFocusData[chapter.id] ? (
                                  <div className="flex items-center gap-3">
                                    <span className="text-cyan-400 text-sm flex items-center gap-1">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                      </svg>
                                      Focus disponibile
                                    </span>
                                    <span className="text-slate-500 text-sm">
                                      {aiFocusData[chapter.id].search_queries?.length || 0} suggerimenti
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-500 text-sm">Nessun focus generato</span>
                                )}
                              </div>
                            </div>

                            {/* AI Focus Actions */}
                            <div className="flex items-center gap-2 ml-4">
                              {aiFocusData[chapter.id] ? (
                                <>
                                  <button
                                    onClick={() => setShowFocusModal({ chapterId: chapter.id, chapterTitle: chapter.title })}
                                    className="px-3 py-1.5 bg-cyan-500 text-white text-sm rounded-lg hover:bg-cyan-600 transition-colors flex items-center gap-2"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                    </svg>
                                    Visualizza
                                  </button>
                                  <button
                                    onClick={() => handleGenerateAIFocus(chapter.id, chapter.title)}
                                    disabled={generatingFocusId !== null}
                                    className="px-3 py-1.5 bg-slate-700 text-slate-300 text-sm rounded-lg hover:bg-slate-600 transition-colors"
                                    title="Rigenera AI Focus"
                                  >
                                    🔄
                                  </button>
                                </>
                              ) : chapter.processing_status === "completed" ? (
                                <button
                                  onClick={() => handleGenerateAIFocus(chapter.id, chapter.title)}
                                  disabled={generatingFocusId !== null}
                                  className="px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
                                >
                                  {generatingFocusId === chapter.id ? (
                                    <>
                                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                      Analizzando...
                                    </>
                                  ) : (
                                    <>
                                      <span>🔍</span>
                                      Genera AI Focus
                                    </>
                                  )}
                                </button>
                              ) : (
                                <span className="text-slate-500 text-sm">Capitolo non elaborato</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : selectedTool === "maps" ? (
                    /* MAPPE: link per source */
                    <div className="divide-y divide-slate-700/50">
                      {source.chapters.some(c => c.processing_status === "completed") ? (
                        <div className="p-4 flex items-center justify-between">
                          <div>
                            <p className="text-white font-medium">Mappa Concettuale</p>
                            <p className="text-slate-400 text-sm mt-0.5">Visualizza o genera la mappa interattiva</p>
                          </div>
                          <a
                            href={`/dashboard/source/${source.id}/mindmap`}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
                          >
                            <span>🗺️</span>
                            Apri Mappa
                          </a>
                        </div>
                      ) : (
                        <div className="p-4 text-slate-500 text-sm">Nessun capitolo elaborato</div>
                      )}
                    </div>
                  ) : selectedTool === "presentations" ? (
                    /* SLIDES: link per source */
                    <div className="divide-y divide-slate-700/50">
                      {source.chapters.some(c => c.processing_status === "completed") ? (
                        <div className="p-4 flex items-center justify-between">
                          <div>
                            <p className="text-white font-medium">Presentazione AI</p>
                            <p className="text-slate-400 text-sm mt-0.5">Visualizza o genera le slides</p>
                          </div>
                          <a
                            href={`/dashboard/source/${source.id}/slides`}
                            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white text-sm rounded-lg hover:opacity-90 transition-opacity"
                          >
                            <span>🎯</span>
                            Apri Slides
                          </a>
                        </div>
                      ) : (
                        <div className="p-4 text-slate-500 text-sm">Nessun capitolo elaborato</div>
                      )}
                    </div>
                  ) : (
                    /* Coming Soon */
                    <div className="p-6 text-center text-slate-500">
                      <p>Funzionalità in arrivo...</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-5 text-center">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center mx-auto mb-2">
              <span className="text-sm">🎴</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {sources.reduce((acc, s) => acc + s.chapters.reduce((a, c) => a + c.flashcardCount, 0), 0)}
            </p>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mt-1">Flashcard</p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-orange-600/5 p-5 text-center">
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center mx-auto mb-2">
              <span className="text-sm">📚</span>
            </div>
            <p className="text-3xl font-bold text-white">{totalDue}</p>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mt-1">Da ripassare</p>
          </div>
          <div className="rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-purple-600/5 p-5 text-center">
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center mx-auto mb-2">
              <span className="text-sm">📝</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {sources.reduce((acc, s) => acc + s.chapters.reduce((a, c) => a + c.quizzes.length, 0), 0)}
            </p>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mt-1">Quiz</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 p-5 text-center">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-2">
              <span className="text-sm">📄</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {sources.reduce((acc, s) => acc + s.chapters.filter(c => c.summary !== null).length, 0)}
            </p>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mt-1">Riassunti</p>
          </div>
          <div className="rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 p-5 text-center">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 flex items-center justify-center mx-auto mb-2">
              <span className="text-sm">📖</span>
            </div>
            <p className="text-3xl font-bold text-white">
              {sources.reduce((acc, s) => acc + s.chapters.filter(c => c.processing_status === "completed").length, 0)}
            </p>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider mt-1">Capitoli pronti</p>
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
              <label className="text-slate-400 text-sm mb-2 block">
                {showGeneratePopover.type === "summaries" ? "Lunghezza riassunto" : "Quantità"}
              </label>
              {showGeneratePopover.type === "summaries" ? (
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 6, label: "300", desc: "Breve" },
                    { value: 10, label: "500", desc: "Standard" },
                    { value: 14, label: "700", desc: "Dettagliato" },
                    { value: 20, label: "1000", desc: "Completo" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setGenerateCount(opt.value)}
                      className={`p-3 rounded-xl border-2 transition-all ${
                        generateCount === opt.value
                          ? "border-emerald-500 bg-emerald-500/20"
                          : "border-slate-600 bg-slate-700/50 hover:border-slate-500"
                      }`}
                    >
                      <div className="text-white text-lg font-bold">{opt.label}</div>
                      <div className="text-slate-400 text-xs">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              ) : (
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
              )}
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

      {/* Summary Reader Modal */}
      {showSummaryReader && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 z-40"
            onClick={() => setShowSummaryReader(null)}
          />
          {/* Modal */}
          <div className="fixed inset-4 md:inset-8 lg:inset-16 bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl z-50 flex flex-col overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-slate-800/50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📄</span>
                <div>
                  <h3 className="text-white font-semibold text-lg">Riassunto</h3>
                  <p className="text-slate-400 text-sm">
                    {showSummaryReader.word_count} parole • Generato il {new Date(showSummaryReader.created_at).toLocaleDateString('it-IT', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSummaryReader(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8">
              <div className="max-w-3xl mx-auto">
                <div
                  className="text-slate-200 leading-relaxed summary-content"
                  dangerouslySetInnerHTML={{
                    __html: (() => {
                      // First render LaTeX, then apply markdown formatting
                      let html = renderLatexInText(showSummaryReader.content);
                      return html
                        // Headers
                        .replace(/^### (.*$)/gm, '<h3 class="text-lg font-semibold text-emerald-400 mt-8 mb-4 flex items-center gap-2"><span class="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>$1</h3>')
                        .replace(/^## (.*$)/gm, '<h2 class="text-xl font-bold text-white mt-10 mb-4 pb-3 border-b border-slate-700/50">$1</h2>')
                        .replace(/^\*\*([^*]+)\*\*$/gm, '<h2 class="text-xl font-bold text-white mt-10 mb-4 pb-3 border-b border-slate-700/50">$1</h2>')
                        .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
                        .replace(/\*([^*]+)\*/g, '<em class="text-slate-300">$1</em>')
                        .replace(/^\* (.*)/gm, '<li class="ml-6 mb-2 text-slate-300 flex items-start gap-2"><span class="text-emerald-500 mt-1.5">•</span><span>$1</span></li>')
                        .replace(/^- (.*)/gm, '<li class="ml-6 mb-2 text-slate-300 flex items-start gap-2"><span class="text-emerald-500 mt-1.5">•</span><span>$1</span></li>')
                        .replace(/^• (.*)/gm, '<li class="ml-6 mb-2 text-slate-300 flex items-start gap-2"><span class="text-emerald-500 mt-1.5">•</span><span>$1</span></li>')
                        .replace(/\n\n/g, '</p><p class="mb-5 text-slate-300">');
                    })()
                  }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/50">
              <div className="text-slate-500 text-sm">
                Usa i riassunti per ripassare velocemente i concetti chiave
              </div>
              <button
                onClick={() => setShowSummaryReader(null)}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                Chiudi
              </button>
            </div>
          </div>
        </>
      )}

      {/* AI Focus Modal */}
      {showFocusModal && aiFocusData[showFocusModal.chapterId] && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 z-40"
            onClick={() => setShowFocusModal(null)}
          />
          {/* Modal */}
          <div className="fixed inset-4 md:inset-8 lg:inset-16 bg-slate-900 rounded-2xl border border-cyan-500/30 shadow-2xl z-50 flex flex-col overflow-hidden animate-fadeIn">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700 bg-gradient-to-r from-cyan-900/30 to-blue-900/30">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔍</span>
                <div>
                  <h3 className="text-white font-semibold text-lg">AI Focus</h3>
                  <p className="text-slate-400 text-sm">
                    {showFocusModal.chapterTitle}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFocusModal(null)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8">
              <div className="max-w-4xl mx-auto space-y-8">
                {/* Main Topic */}
                <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 rounded-xl p-6 border border-cyan-500/20">
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {aiFocusData[showFocusModal.chapterId].main_topic}
                  </h2>
                  {aiFocusData[showFocusModal.chapterId].subtopics.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {aiFocusData[showFocusModal.chapterId].subtopics.map((subtopic, i) => (
                        <span key={i} className="px-3 py-1 bg-slate-800 text-slate-300 rounded-full text-sm">
                          {subtopic}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Concepts to Explore */}
                {aiFocusData[showFocusModal.chapterId].concepts_to_explore.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <span className="text-cyan-400">💡</span>
                      Concetti da approfondire
                    </h3>
                    <div className="grid gap-3">
                      {aiFocusData[showFocusModal.chapterId].concepts_to_explore.map((item, i) => (
                        <div key={i} className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
                          <div className="text-white font-medium mb-1">{item.concept}</div>
                          <div className="text-slate-400 text-sm">{item.why}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Search Queries / Resources */}
                {aiFocusData[showFocusModal.chapterId].search_queries.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <span className="text-cyan-400">🔗</span>
                      Risorse suggerite
                    </h3>
                    <div className="grid gap-3">
                      {aiFocusData[showFocusModal.chapterId].search_queries.map((item, i) => {
                        const typeIcons: Record<string, string> = {
                          video: "🎬",
                          article: "📰",
                          tutorial: "📚",
                          example: "💻",
                        };
                        const typeColors: Record<string, string> = {
                          video: "from-red-500/20 to-pink-500/20 border-red-500/30",
                          article: "from-blue-500/20 to-indigo-500/20 border-blue-500/30",
                          tutorial: "from-green-500/20 to-emerald-500/20 border-green-500/30",
                          example: "from-purple-500/20 to-violet-500/20 border-purple-500/30",
                        };
                        const bgClass = typeColors[item.type] || "from-slate-500/20 to-slate-600/20 border-slate-500/30";

                        return (
                          <a
                            key={i}
                            href={`https://www.google.com/search?q=${encodeURIComponent(item.query)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`bg-gradient-to-r ${bgClass} rounded-xl p-4 border hover:scale-[1.02] transition-transform group`}
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-2xl">{typeIcons[item.type] || "🔍"}</span>
                              <div className="flex-1">
                                <div className="text-white font-medium group-hover:text-cyan-300 transition-colors flex items-center gap-2">
                                  {item.query}
                                  <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                  </svg>
                                </div>
                                <div className="text-slate-400 text-sm mt-1">{item.purpose}</div>
                              </div>
                              <span className="text-xs uppercase tracking-wider text-slate-500 bg-slate-800 px-2 py-1 rounded">
                                {item.type}
                              </span>
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Study Tips */}
                {aiFocusData[showFocusModal.chapterId].study_tips.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                      <span className="text-cyan-400">✨</span>
                      Consigli di studio
                    </h3>
                    <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700">
                      <ul className="space-y-3">
                        {aiFocusData[showFocusModal.chapterId].study_tips.map((tip, i) => (
                          <li key={i} className="flex items-start gap-3 text-slate-300">
                            <span className="text-cyan-400 mt-0.5">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700 bg-slate-800/50">
              <div className="text-slate-500 text-sm">
                Clicca sulle risorse per cercare su Google
              </div>
              <button
                onClick={() => setShowFocusModal(null)}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                Chiudi
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

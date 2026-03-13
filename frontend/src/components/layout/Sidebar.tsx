"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLayout } from "@/contexts/LayoutContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase, Source, Chapter } from "@/lib/supabase";

interface SourceWithChapters extends Source {
  chapters: Chapter[];
  dueCount: number;
  flashcardCount: number;
  quizCount: number;
  hasCompletedChapters: boolean;
}

interface DueCountByChapter {
  [chapterId: string]: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen, sidebarWidth, setSidebarWidth, isMobile, sidebarRefreshKey } = useLayout();
  const { user, profile } = useAuth();

  const [sources, setSources] = useState<SourceWithChapters[]>([]);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [totalDueCards, setTotalDueCards] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingSourceId, setDeletingSourceId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Fetch sources with chapters and due counts
  useEffect(() => {
    if (!user) return;

    const fetchData = async (isInitial = false) => {
      if (isInitial) setIsLoading(true);

      try {
        // Fetch sources
        const { data: sourcesData } = await supabase
          .from("sources")
          .select("*")
          .eq("user_id", user.id)
          .order("title", { ascending: true });

        if (!sourcesData) {
          setSources([]);
          setIsLoading(false);
          return;
        }

        // Fetch chapters for all sources
        const { data: chaptersData } = await supabase
          .from("chapters")
          .select("*")
          .in("source_id", sourcesData.map(s => s.id))
          .order("order_index", { ascending: true });

        // Fetch due counts from reviews
        const now = new Date().toISOString();
        const { data: dueData } = await supabase
          .from("reviews")
          .select(`
            id,
            flashcards!inner (
              chapter_id
            )
          `)
          .eq("user_id", user.id)
          .lte("due", now);

        // Count due cards by chapter
        const dueByChapter: DueCountByChapter = {};
        let total = 0;

        if (dueData) {
          dueData.forEach((review: any) => {
            const chapterId = review.flashcards?.chapter_id;
            if (chapterId) {
              dueByChapter[chapterId] = (dueByChapter[chapterId] || 0) + 1;
              total++;
            }
          });
        }

        setTotalDueCards(total);

        // Fetch flashcard counts per source
        const chapterIds = (chaptersData || []).map(c => c.id);
        let flashcardsByChapter: Record<string, number> = {};
        let quizzesByChapter: Record<string, number> = {};

        if (chapterIds.length > 0) {
          // Get flashcard counts
          const { data: flashcardsData } = await supabase
            .from("flashcards")
            .select("chapter_id")
            .in("chapter_id", chapterIds)
            .eq("user_id", user.id);

          if (flashcardsData) {
            flashcardsData.forEach((f: any) => {
              flashcardsByChapter[f.chapter_id] = (flashcardsByChapter[f.chapter_id] || 0) + 1;
            });
          }

          // Get quiz counts
          const { data: quizzesData } = await supabase
            .from("quizzes")
            .select("chapter_id")
            .in("chapter_id", chapterIds)
            .eq("user_id", user.id);

          if (quizzesData) {
            quizzesData.forEach((q: any) => {
              quizzesByChapter[q.chapter_id] = (quizzesByChapter[q.chapter_id] || 0) + 1;
            });
          }
        }

        // Combine data
        const sourcesWithChapters: SourceWithChapters[] = sourcesData.map(source => {
          const sourceChapters = (chaptersData || []).filter(c => c.source_id === source.id);
          const sourceDueCount = sourceChapters.reduce((acc, ch) => acc + (dueByChapter[ch.id] || 0), 0);
          const sourceFlashcardCount = sourceChapters.reduce((acc, ch) => acc + (flashcardsByChapter[ch.id] || 0), 0);
          const sourceQuizCount = sourceChapters.reduce((acc, ch) => acc + (quizzesByChapter[ch.id] || 0), 0);
          const hasCompleted = sourceChapters.some(ch => ch.processing_status === "completed");

          return {
            ...source,
            chapters: sourceChapters.map(ch => ({
              ...ch,
            })),
            dueCount: sourceDueCount,
            flashcardCount: sourceFlashcardCount,
            quizCount: sourceQuizCount,
            hasCompletedChapters: hasCompleted,
          };
        });

        setSources(sourcesWithChapters);

        // Auto-expand sources with due cards
        const toExpand = new Set<string>();
        sourcesWithChapters.forEach(s => {
          if (s.dueCount > 0) {
            toExpand.add(s.id);
          }
        });
        // Also expand current source if viewing a source page
        const sourceMatch = pathname.match(/\/dashboard\/source\/([^/]+)/);
        if (sourceMatch) {
          toExpand.add(sourceMatch[1]);
        }
        setExpandedSources(toExpand);

      } catch (error) {
        console.error("Error fetching sidebar data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    // Show loading only on first load (no sources yet)
    fetchData(sources.length === 0);

    // Refresh every 30 seconds (silent, no loading state)
    const interval = setInterval(() => fetchData(false), 30000);

    // Also refresh when window regains focus (silent)
    const handleFocus = () => fetchData(false);
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [user, pathname, sidebarRefreshKey]);

  // Handle resize
  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      setSidebarWidth(e.clientX);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

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

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + "/");
  };

  const getSourceIcon = (source: SourceWithChapters) => {
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

  const handleDeleteSource = async (sourceId: string) => {
    if (!user) return;

    setDeletingSourceId(sourceId);
    try {
      // Get chapters
      const { data: chaptersData } = await supabase
        .from("chapters")
        .select("id")
        .eq("source_id", sourceId);

      const chapterIds = chaptersData?.map(c => c.id) || [];

      if (chapterIds.length > 0) {
        // Get flashcards
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
        await supabase.from("chapters").delete().eq("source_id", sourceId);
      }

      // Delete the source
      await supabase
        .from("sources")
        .delete()
        .eq("id", sourceId)
        .eq("user_id", user.id);

      // Update local state
      setSources(prev => prev.filter(s => s.id !== sourceId));
      setShowDeleteConfirm(null);

      // Navigate to dashboard if we're on the deleted source's page
      if (pathname.includes(sourceId)) {
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Error deleting source:", error);
    } finally {
      setDeletingSourceId(null);
    }
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo + Collapse Button */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
            <span className="text-white text-xl">📚</span>
          </div>
          <span className="text-white font-bold text-xl">Backup Buddy</span>
        </div>
        {/* Collapse button - desktop only */}
        {!isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all duration-300"
            title="Chiudi sidebar (⌘/Ctrl + B)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Main Navigation */}
      <div className="px-3 py-3">
        <Link
          href="/dashboard"
          onClick={() => isMobile && setSidebarOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 ${
            pathname === "/dashboard"
              ? "bg-gradient-to-r from-blue-600/20 to-purple-600/20 text-white border border-purple-500/30"
              : "text-slate-400 hover:bg-white/5 hover:text-white hover:border-white/10 border border-transparent"
          }`}
        >
          <span className="text-lg">🏠</span>
          <span className="font-medium">Dashboard</span>
        </Link>

        <Link
          href="/dashboard/study"
          onClick={() => isMobile && setSidebarOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 mt-1 ${
            pathname.startsWith("/dashboard/study")
              ? "bg-gradient-to-r from-blue-600/20 to-purple-600/20 text-white border border-purple-500/30"
              : "text-slate-400 hover:bg-white/5 hover:text-white hover:border-white/10 border border-transparent"
          }`}
        >
          <span className="text-lg">🎯</span>
          <span className="font-medium">Studia Ora</span>
          {totalDueCards > 0 && (
            <span className="ml-auto bg-gradient-to-r from-cyan-500 to-emerald-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center animate-pulse">
              {totalDueCards > 99 ? "99+" : totalDueCards}
            </span>
          )}
        </Link>
      </div>

      {/* Library Section */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="flex items-center mb-2 px-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Libreria</span>
        </div>

        {isLoading ? (
          <div className="px-3 py-4">
            <div className="animate-pulse space-y-3">
              <div className="h-8 bg-white/5 rounded-xl"></div>
              <div className="h-8 bg-white/5 rounded-xl"></div>
              <div className="h-8 bg-white/5 rounded-xl"></div>
            </div>
          </div>
        ) : sources.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <p className="text-slate-500 text-sm">Nessun libro</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-purple-400 text-sm hover:text-purple-300 mt-2 transition-colors"
            >
              + Aggiungi il primo
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            {sources.map((source) => (
              <div key={source.id}>
                {/* Source Item */}
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all duration-300 group ${
                    isActive(`/dashboard/source/${source.id}`)
                      ? "bg-white/10 text-white border border-purple-500/30"
                      : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent"
                  }`}
                >
                  <button
                    onClick={() => toggleSource(source.id)}
                    className="text-slate-500 hover:text-white transition-colors"
                  >
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${
                        expandedSources.has(source.id) ? "rotate-90" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <Link
                    href={`/dashboard/source/${source.id}`}
                    onClick={() => isMobile && setSidebarOpen(false)}
                    className="flex-1 flex items-center gap-2 min-w-0"
                  >
                    <span>{getSourceIcon(source)}</span>
                    <span className="truncate text-sm font-medium">{source.title}</span>
                  </Link>
                  {source.dueCount > 0 && (
                    <span className="bg-blue-500/20 text-blue-400 text-xs font-medium px-1.5 py-0.5 rounded">
                      {source.dueCount}
                    </span>
                  )}
                  {/* Delete button - appears on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(source.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-red-400 hover:bg-red-500/20 rounded transition-all"
                    title="Elimina libro"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Delete Confirmation Inline */}
                {showDeleteConfirm === source.id && (
                  <div className="ml-6 mt-1 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <p className="text-red-300 text-xs mb-2">Eliminare "{source.title}" e tutti i contenuti?</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowDeleteConfirm(null)}
                        className="flex-1 px-2 py-1 bg-slate-700 text-slate-300 text-xs rounded hover:bg-slate-600 transition-colors"
                      >
                        Annulla
                      </button>
                      <button
                        onClick={() => handleDeleteSource(source.id)}
                        disabled={deletingSourceId === source.id}
                        className="flex-1 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {deletingSourceId === source.id ? (
                          <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        ) : (
                          "Elimina"
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* Study Sections */}
                {expandedSources.has(source.id) && (
                  <div className="ml-6 mt-1 space-y-0.5 border-l border-slate-700 pl-3">
                    {/* Flashcards */}
                    <Link
                      href={`/dashboard/source/${source.id}/flashcards`}
                      onClick={() => isMobile && setSidebarOpen(false)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-all duration-200 ${
                        pathname === `/dashboard/source/${source.id}/flashcards`
                          ? "bg-purple-500/20 text-purple-300"
                          : "text-slate-500 hover:bg-slate-700/30 hover:text-slate-300"
                      }`}
                    >
                      <span>🎴</span>
                      <span className="flex-1">Flashcards</span>
                      {source.flashcardCount > 0 && (
                        <span className="text-purple-400 text-xs font-medium">{source.flashcardCount}</span>
                      )}
                    </Link>

                    {/* Quiz */}
                    <Link
                      href={`/dashboard/source/${source.id}/quiz`}
                      onClick={() => isMobile && setSidebarOpen(false)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-all duration-200 ${
                        pathname === `/dashboard/source/${source.id}/quiz`
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "text-slate-500 hover:bg-slate-700/30 hover:text-slate-300"
                      }`}
                    >
                      <span>📝</span>
                      <span className="flex-1">Quiz</span>
                      {source.quizCount > 0 && (
                        <span className="text-emerald-400 text-xs font-medium">{source.quizCount}</span>
                      )}
                    </Link>

                    {/* Riassunti */}
                    <Link
                      href={`/dashboard/source/${source.id}/summaries`}
                      onClick={() => isMobile && setSidebarOpen(false)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-all duration-200 ${
                        pathname === `/dashboard/source/${source.id}/summaries`
                          ? "bg-blue-500/20 text-blue-300"
                          : "text-slate-500 hover:bg-slate-700/30 hover:text-slate-300"
                      }`}
                    >
                      <span>📖</span>
                      <span className="flex-1">Riassunti</span>
                      {source.hasCompletedChapters && (
                        <span className="text-green-500 text-xs">✓</span>
                      )}
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Section */}
      <div className="border-t border-white/10 px-3 py-3 space-y-1">
        <Link
          href="/stats"
          onClick={() => isMobile && setSidebarOpen(false)}
          className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 ${
            pathname === "/stats"
              ? "bg-white/10 text-white"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          <span className="text-lg">📊</span>
          <span className="text-sm font-medium">Statistiche</span>
        </Link>
        <Link
          href="/feedback"
          onClick={() => isMobile && setSidebarOpen(false)}
          className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 ${
            pathname === "/feedback"
              ? "bg-white/10 text-white"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          <span className="text-lg">💬</span>
          <span className="text-sm font-medium">Feedback</span>
        </Link>
        <Link
          href="/help"
          onClick={() => isMobile && setSidebarOpen(false)}
          className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 ${
            pathname === "/help"
              ? "bg-white/10 text-white"
              : "text-slate-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          <span className="text-lg">❓</span>
          <span className="text-sm font-medium">Aiuto</span>
        </Link>
      </div>

      {/* User Section */}
      <div className="border-t border-white/10 px-3 py-3">
        <Link
          href="/settings"
          onClick={() => isMobile && setSidebarOpen(false)}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:bg-white/5 hover:text-white transition-all duration-300"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/25">
            <span className="text-white text-sm font-bold">
              {profile?.display_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {profile?.display_name || "Utente"}
            </p>
            <p className="text-xs text-slate-500 truncate">{user?.email}</p>
          </div>
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      </div>
    </div>
  );

  // Mobile: render overlay
  if (isMobile) {
    return (
      <>
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <aside
          ref={sidebarRef}
          className={`fixed top-0 left-0 h-full w-72 bg-[#0f172a]/95 backdrop-blur-xl border-r border-white/10 z-50 transform transition-transform duration-300 ease-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {sidebarContent}
        </aside>
      </>
    );
  }

  // Desktop: render fixed sidebar
  return (
    <aside
      ref={sidebarRef}
      style={{ width: sidebarWidth }}
      className={`hidden lg:flex fixed top-0 left-0 h-full bg-[#0f172a]/80 backdrop-blur-xl border-r border-white/10 z-30 flex-col transition-all duration-300 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {sidebarContent}

      {/* Resize handle */}
      <div
        onMouseDown={startResizing}
        className={`absolute top-0 right-0 w-1.5 h-full cursor-ew-resize transition-colors ${
          isResizing ? "bg-purple-500" : "bg-transparent hover:bg-purple-500/50"
        }`}
      />
    </aside>
  );
}

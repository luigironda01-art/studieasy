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
}

interface DueCountByChapter {
  [chapterId: string]: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarOpen, setSidebarOpen, sidebarWidth, setSidebarWidth, isMobile } = useLayout();
  const { user, profile } = useAuth();

  const [sources, setSources] = useState<SourceWithChapters[]>([]);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [totalDueCards, setTotalDueCards] = useState(0);
  const [isResizing, setIsResizing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Fetch sources with chapters and due counts
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setIsLoading(true);

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

        // Combine data
        const sourcesWithChapters: SourceWithChapters[] = sourcesData.map(source => {
          const sourceChapters = (chaptersData || []).filter(c => c.source_id === source.id);
          const sourceDueCount = sourceChapters.reduce((acc, ch) => acc + (dueByChapter[ch.id] || 0), 0);

          return {
            ...source,
            chapters: sourceChapters.map(ch => ({
              ...ch,
            })),
            dueCount: sourceDueCount,
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

    fetchData();

    // Refresh every 2 minutes
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [user, pathname]);

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

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo + Collapse Button */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white text-xl">📚</span>
          </div>
          <span className="text-white font-bold text-xl">Studieasy</span>
        </div>
        {/* Collapse button - desktop only */}
        {!isMobile && (
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
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
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
            pathname === "/dashboard"
              ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border-l-2 border-blue-500"
              : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
          }`}
        >
          <span className="text-lg">🏠</span>
          <span className="font-medium">Dashboard</span>
        </Link>

        <Link
          href="/dashboard/study"
          onClick={() => isMobile && setSidebarOpen(false)}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 mt-1 ${
            pathname.startsWith("/dashboard/study")
              ? "bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-white border-l-2 border-blue-500"
              : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
          }`}
        >
          <span className="text-lg">🎯</span>
          <span className="font-medium">Studia Ora</span>
          {totalDueCards > 0 && (
            <span className="ml-auto bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[24px] text-center animate-pulse">
              {totalDueCards > 99 ? "99+" : totalDueCards}
            </span>
          )}
        </Link>
      </div>

      {/* Library Section */}
      <div className="flex-1 overflow-y-auto px-3 py-2">
        <div className="flex items-center justify-between mb-2 px-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Libreria</span>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-slate-500 hover:text-white transition-colors p-1 rounded hover:bg-slate-700"
            title="Aggiungi libro"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="px-3 py-4">
            <div className="animate-pulse space-y-3">
              <div className="h-8 bg-slate-700 rounded"></div>
              <div className="h-8 bg-slate-700 rounded"></div>
              <div className="h-8 bg-slate-700 rounded"></div>
            </div>
          </div>
        ) : sources.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <p className="text-slate-500 text-sm">Nessun libro</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="text-blue-400 text-sm hover:text-blue-300 mt-2"
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
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 group ${
                    isActive(`/dashboard/source/${source.id}`)
                      ? "bg-slate-700/50 text-white"
                      : "text-slate-400 hover:bg-slate-700/30 hover:text-white"
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
                </div>

                {/* Chapters */}
                {expandedSources.has(source.id) && source.chapters.length > 0 && (
                  <div className="ml-6 mt-1 space-y-0.5 border-l border-slate-700 pl-3">
                    {source.chapters.map((chapter) => (
                      <Link
                        key={chapter.id}
                        href={`/dashboard/source/${source.id}?chapter=${chapter.id}`}
                        onClick={() => isMobile && setSidebarOpen(false)}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-all duration-200 ${
                          pathname.includes(chapter.id)
                            ? "bg-slate-700/50 text-white"
                            : "text-slate-500 hover:bg-slate-700/30 hover:text-slate-300"
                        }`}
                      >
                        <span className="truncate flex-1">{chapter.title}</span>
                        {chapter.processing_status === "completed" && (
                          <span className="text-green-500 text-xs">✓</span>
                        )}
                        {chapter.processing_status === "processing" && (
                          <span className="text-amber-500 text-xs animate-pulse">⏳</span>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Section */}
      <div className="border-t border-slate-700 px-3 py-3 space-y-1">
        <Link
          href="/stats"
          onClick={() => isMobile && setSidebarOpen(false)}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
            pathname === "/stats"
              ? "bg-slate-700/50 text-white"
              : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
          }`}
        >
          <span className="text-lg">📊</span>
          <span className="text-sm font-medium">Statistiche</span>
        </Link>
        <Link
          href="/feedback"
          onClick={() => isMobile && setSidebarOpen(false)}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
            pathname === "/feedback"
              ? "bg-slate-700/50 text-white"
              : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
          }`}
        >
          <span className="text-lg">💬</span>
          <span className="text-sm font-medium">Feedback</span>
        </Link>
        <Link
          href="/help"
          onClick={() => isMobile && setSidebarOpen(false)}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 ${
            pathname === "/help"
              ? "bg-slate-700/50 text-white"
              : "text-slate-400 hover:bg-slate-700/50 hover:text-white"
          }`}
        >
          <span className="text-lg">❓</span>
          <span className="text-sm font-medium">Aiuto</span>
        </Link>
      </div>

      {/* User Section */}
      <div className="border-t border-slate-700 px-3 py-3">
        <Link
          href="/settings"
          onClick={() => isMobile && setSidebarOpen(false)}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-700/50 hover:text-white transition-all duration-200"
        >
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
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
          className={`fixed top-0 left-0 h-full w-72 bg-slate-800 border-r border-slate-700 z-50 transform transition-transform duration-300 ease-out ${
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
      className={`hidden lg:flex fixed top-0 left-0 h-full bg-slate-800 border-r border-slate-700 z-30 flex-col transition-all duration-300 ${
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {sidebarContent}

      {/* Resize handle */}
      <div
        onMouseDown={startResizing}
        className={`absolute top-0 right-0 w-1.5 h-full cursor-ew-resize transition-colors ${
          isResizing ? "bg-blue-500" : "bg-transparent hover:bg-blue-500/50"
        }`}
      />
    </aside>
  );
}

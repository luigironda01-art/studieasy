"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter, Flashcard } from "@/lib/supabase";

interface FlashcardWithChapter extends Flashcard {
  chapter?: { title: string };
}

interface BatchGroup {
  batchId: string;
  date: string;
  chapterTitle: string;
  cards: FlashcardWithChapter[];
}

interface DifficultyGroup {
  key: string;
  label: string;
  icon: string;
  color: string;
  borderColor: string;
  bgColor: string;
  batches: BatchGroup[];
  totalCards: number;
}

export default function SourceFlashcardsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sourceId = params.id as string;

  const [source, setSource] = useState<Source | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardWithChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingCard, setViewingCard] = useState<FlashcardWithChapter | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

  // Filters
  const [filterChapter, setFilterChapter] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<string>("all");

  // Collapsed state: difficulty level and individual batches
  const [collapsedDifficulties, setCollapsedDifficulties] = useState<Set<string>>(new Set());
  const [collapsedBatches, setCollapsedBatches] = useState<Set<string>>(new Set());

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
          { label: "Flashcards" },
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
        const { data: flashcardsData } = await supabase
          .from("flashcards")
          .select("*, chapters(title)")
          .in("chapter_id", chapterIds)
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false });

        if (flashcardsData) {
          setFlashcards(flashcardsData.map(f => ({
            ...f,
            chapter: f.chapters as unknown as { title: string }
          })));
        }
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
      const response = await fetch("/api/flashcards/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: generateChapterId,
          userId: user.id,
          numCards: generateCount,
          difficulty: generateDifficulty,
          language: "it",
        }),
      });

      if (!response.ok) {
        throw new Error("Generazione fallita");
      }

      setShowGenerateModal(false);
      await fetchData();
    } catch (err) {
      console.error("Error generating:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!user) return;

    try {
      await supabase.from("reviews").delete().eq("flashcard_id", cardId);
      await supabase.from("flashcards").delete().eq("id", cardId);

      setFlashcards(prev => prev.filter(f => f.id !== cardId));
      setViewingCard(null);
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  // Get unique generation dates for filter
  const uniqueDates = useMemo(() => {
    const dates = new Set<string>();
    flashcards.forEach(f => {
      if (f.created_at) {
        dates.add(new Date(f.created_at).toLocaleDateString("it-IT"));
      }
    });
    return Array.from(dates).sort().reverse();
  }, [flashcards]);

  // Apply filters
  const filteredCards = useMemo(() => {
    return flashcards.filter(card => {
      if (filterChapter !== "all" && card.chapter_id !== filterChapter) return false;
      if (filterDate !== "all") {
        const cardDate = card.created_at ? new Date(card.created_at).toLocaleDateString("it-IT") : "";
        if (cardDate !== filterDate) return false;
      }
      return true;
    });
  }, [flashcards, filterChapter, filterDate]);

  // Two-level grouping: Difficulty -> Batches
  const difficultyGroups = useMemo(() => {
    const diffConfigs = [
      { key: "easy", label: "Facile", icon: "🟢", color: "green", borderColor: "border-green-500/30", bgColor: "bg-green-500/10" },
      { key: "medium", label: "Media", icon: "🟡", color: "amber", borderColor: "border-amber-500/30", bgColor: "bg-amber-500/10" },
      { key: "hard", label: "Difficile", icon: "🔴", color: "red", borderColor: "border-red-500/30", bgColor: "bg-red-500/10" },
    ];

    const groups: DifficultyGroup[] = [];

    for (const config of diffConfigs) {
      const cardsForDifficulty = filteredCards.filter(c => c.difficulty === config.key);
      if (cardsForDifficulty.length === 0) continue;

      // Group by batch_id within this difficulty
      const batchMap = new Map<string, FlashcardWithChapter[]>();
      cardsForDifficulty.forEach(card => {
        const batchKey = (card as any).batch_id || `single-${card.id}`;
        if (!batchMap.has(batchKey)) {
          batchMap.set(batchKey, []);
        }
        batchMap.get(batchKey)!.push(card);
      });

      const batches: BatchGroup[] = [];
      batchMap.forEach((cards, batchId) => {
        const firstCard = cards[0];
        const date = firstCard.created_at
          ? new Date(firstCard.created_at).toLocaleDateString("it-IT", {
              day: "2-digit",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Data sconosciuta";
        const chapterTitle = firstCard.chapter?.title || "Capitolo";
        batches.push({ batchId, date, chapterTitle, cards });
      });

      // Sort batches by date (newest first)
      batches.sort((a, b) => {
        const dateA = a.cards[0]?.created_at || "";
        const dateB = b.cards[0]?.created_at || "";
        return dateB.localeCompare(dateA);
      });

      groups.push({
        ...config,
        batches,
        totalCards: cardsForDifficulty.length,
      });
    }

    return groups;
  }, [filteredCards]);

  const toggleDifficulty = (key: string) => {
    setCollapsedDifficulties(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleBatch = (batchId: string) => {
    setCollapsedBatches(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  };

  const collapseAll = () => {
    setCollapsedDifficulties(new Set(difficultyGroups.map(g => g.key)));
    const allBatchIds = difficultyGroups.flatMap(g => g.batches.map(b => b.batchId));
    setCollapsedBatches(new Set(allBatchIds));
  };

  const expandAll = () => {
    setCollapsedDifficulties(new Set());
    setCollapsedBatches(new Set());
  };

  const difficultyLabel = (d: string) =>
    d === "easy" ? "Facile" : d === "hard" ? "Difficile" : "Media";

  const activeFiltersCount = [filterChapter, filterDate].filter(f => f !== "all").length;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
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
              <span className="text-4xl">🎴</span>
              Flashcards
            </h1>
            <p className="text-slate-400 mt-1">{source?.title}</p>
          </div>
          <button
            onClick={() => setShowGenerateModal(true)}
            disabled={chapters.length === 0}
            className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            <span>✨</span>
            Genera Nuove
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
          <div className="text-3xl font-bold text-white">{flashcards.length}</div>
          <div className="text-slate-400 text-sm">Totale</div>
        </div>
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
          <div className="text-3xl font-bold text-green-400">{flashcards.filter(f => f.difficulty === "easy").length}</div>
          <div className="text-slate-400 text-sm">Facili</div>
        </div>
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
          <div className="text-3xl font-bold text-amber-400">{flashcards.filter(f => f.difficulty === "medium").length}</div>
          <div className="text-slate-400 text-sm">Medie</div>
        </div>
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-4">
          <div className="text-3xl font-bold text-red-400">{flashcards.filter(f => f.difficulty === "hard").length}</div>
          <div className="text-slate-400 text-sm">Difficili</div>
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
              <span className="bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {activeFiltersCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {activeFiltersCount > 0 && (
              <button
                onClick={() => { setFilterChapter("all"); setFilterDate("all"); }}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Resetta filtri
              </button>
            )}
            <span className="text-slate-600">|</span>
            <button
              onClick={collapseAll}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Chiudi tutti
            </button>
            <button
              onClick={expandAll}
              className="text-xs text-slate-400 hover:text-white transition-colors"
            >
              Apri tutti
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Chapter filter */}
          <select
            value={filterChapter}
            onChange={(e) => setFilterChapter(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">Tutti i capitoli</option>
            {chapters.map(ch => {
              const count = flashcards.filter(f => f.chapter_id === ch.id).length;
              return (
                <option key={ch.id} value={ch.id}>
                  {ch.title} ({count})
                </option>
              );
            })}
          </select>

          {/* Date filter */}
          <select
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="all">Tutte le date</option>
            {uniqueDates.map(date => (
              <option key={date} value={date}>{date}</option>
            ))}
          </select>
        </div>

        {filteredCards.length !== flashcards.length && (
          <div className="mt-3 text-sm text-slate-400">
            Mostrando {filteredCards.length} di {flashcards.length} flashcard
          </div>
        )}
      </div>

      {/* Two-level: Difficulty -> Batches */}
      {filteredCards.length === 0 ? (
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-12 text-center">
          <div className="w-20 h-20 bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🎴</span>
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">
            {flashcards.length === 0 ? "Nessuna flashcard" : "Nessun risultato"}
          </h3>
          <p className="text-slate-400 mb-6">
            {flashcards.length === 0
              ? chapters.length === 0
                ? "Elabora prima un capitolo per generare flashcard"
                : "Genera le tue prime flashcard per iniziare a studiare"
              : "Prova a modificare i filtri per visualizzare le flashcard"
            }
          </p>
          {flashcards.length === 0 && chapters.length > 0 && (
            <button
              onClick={() => setShowGenerateModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Genera Flashcards
            </button>
          )}
          {flashcards.length > 0 && activeFiltersCount > 0 && (
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
            const isDiffCollapsed = collapsedDifficulties.has(group.key);

            return (
              <div
                key={group.key}
                className={`bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden`}
              >
                {/* Level 1: Difficulty Header */}
                <button
                  onClick={() => toggleDifficulty(group.key)}
                  className={`w-full px-5 py-4 flex items-center gap-4 hover:bg-white/5 transition-colors`}
                >
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${
                      isDiffCollapsed ? "" : "rotate-90"
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
                      {group.totalCards} carte · {group.batches.length} {group.batches.length === 1 ? "generazione" : "generazioni"}
                    </span>
                  </div>

                  <span className={`text-sm px-3 py-1 rounded-lg font-bold ${group.bgColor} ${group.borderColor} border`}>
                    {group.totalCards}
                  </span>
                </button>

                {/* Level 2: Batches inside difficulty */}
                {!isDiffCollapsed && (
                  <div className="px-4 pb-4 space-y-2">
                    {group.batches.map((batch) => {
                      const isBatchCollapsed = collapsedBatches.has(batch.batchId);

                      return (
                        <div
                          key={batch.batchId}
                          className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden"
                        >
                          {/* Batch Header */}
                          <button
                            onClick={() => toggleBatch(batch.batchId)}
                            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-700/30 transition-colors"
                          >
                            <svg
                              className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
                                isBatchCollapsed ? "" : "rotate-90"
                              }`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>

                            <div className="flex-1 text-left">
                              <span className="text-white text-sm font-medium">
                                {batch.cards.length} flashcard
                              </span>
                              <span className="text-slate-500 text-xs ml-2">
                                · {batch.chapterTitle} · {batch.date}
                              </span>
                            </div>

                            <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-md font-medium">
                              {batch.cards.length}
                            </span>
                          </button>

                          {/* Batch Cards */}
                          {!isBatchCollapsed && (
                            <div className="px-4 pb-4">
                              <div className="border-t border-slate-700/50 pt-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {batch.cards.map((card) => (
                                    <div
                                      key={card.id}
                                      onClick={() => { setViewingCard(card); setShowAnswer(false); }}
                                      className="bg-slate-800 border border-slate-700 rounded-xl p-4 cursor-pointer hover:border-purple-500/50 hover:bg-slate-750 transition-all group"
                                    >
                                      <p className="text-white font-medium text-sm line-clamp-3 group-hover:text-purple-300 transition-colors">
                                        {card.front}
                                      </p>
                                      <div className="mt-3 pt-2 border-t border-slate-700/50 text-right">
                                        <span className="text-slate-500 text-xs">Clicca per vedere</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
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

      {/* View Card Modal */}
      {viewingCard && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40" onClick={() => setViewingCard(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl z-50 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-purple-400 text-sm font-medium">
                  {viewingCard.chapter?.title}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${
                  viewingCard.difficulty === "easy"
                    ? "bg-green-500/20 text-green-400 border-green-500/30"
                    : viewingCard.difficulty === "hard"
                    ? "bg-red-500/20 text-red-400 border-red-500/30"
                    : "bg-amber-500/20 text-amber-400 border-amber-500/30"
                }`}>
                  {difficultyLabel(viewingCard.difficulty || "medium")}
                </span>
              </div>
              <div className="mb-6">
                <h3 className="text-white text-xl font-semibold mb-4">{viewingCard.front}</h3>
                {showAnswer ? (
                  <div className="bg-slate-700/50 rounded-xl p-4">
                    <p className="text-slate-300 leading-relaxed">{viewingCard.back}</p>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAnswer(true)}
                    className="w-full py-4 bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-xl text-purple-300 font-medium hover:bg-purple-500/30 transition-colors"
                  >
                    Mostra Risposta
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setViewingCard(null)}
                  className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors"
                >
                  Chiudi
                </button>
                <button
                  onClick={() => handleDeleteCard(viewingCard.id)}
                  className="px-4 py-3 bg-red-500/20 text-red-400 rounded-xl font-medium hover:bg-red-500/30 transition-colors"
                >
                  Elimina
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Generate Modal */}
      {showGenerateModal && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40" onClick={() => !generating && setShowGenerateModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl z-50 p-6">
            <h3 className="text-white text-xl font-semibold mb-6">Genera Flashcards</h3>

            <div className="space-y-5">
              <div>
                <label className="text-slate-400 text-sm block mb-2">Capitolo</label>
                <select
                  value={generateChapterId}
                  onChange={(e) => setGenerateChapterId(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  {chapters.map(ch => (
                    <option key={ch.id} value={ch.id}>{ch.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 text-sm block mb-2">Numero flashcard</label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
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
                          ? "border-purple-500 bg-purple-500/20 text-white"
                          : "border-slate-600 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {difficultyLabel(d)}
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
                className="flex-1 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {generating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Generando...
                  </>
                ) : (
                  `Genera ${generateCount}`
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

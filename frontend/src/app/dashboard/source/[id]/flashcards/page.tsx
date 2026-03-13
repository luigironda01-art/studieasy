"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter, Flashcard } from "@/lib/supabase";

interface FlashcardWithChapter extends Flashcard {
  chapter?: { title: string };
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
  const [selectedChapter, setSelectedChapter] = useState<string>("all");
  const [viewingCard, setViewingCard] = useState<FlashcardWithChapter | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);

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

      // Fetch flashcards for all chapters of this source
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
      // Delete reviews first
      await supabase.from("reviews").delete().eq("flashcard_id", cardId);
      // Delete flashcard
      await supabase.from("flashcards").delete().eq("id", cardId);

      setFlashcards(prev => prev.filter(f => f.id !== cardId));
      setViewingCard(null);
    } catch (err) {
      console.error("Error deleting:", err);
    }
  };

  const filteredCards = selectedChapter === "all"
    ? flashcards
    : flashcards.filter(f => f.chapter_id === selectedChapter);

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

      {/* Filter */}
      <div className="mb-6 flex items-center gap-4">
        <label className="text-slate-400 text-sm">Filtra per capitolo:</label>
        <select
          value={selectedChapter}
          onChange={(e) => setSelectedChapter(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          <option value="all">Tutti ({flashcards.length})</option>
          {chapters.map(ch => {
            const count = flashcards.filter(f => f.chapter_id === ch.id).length;
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
          <div className="text-3xl font-bold text-white">{flashcards.length}</div>
          <div className="text-slate-400 text-sm">Totale flashcard</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-3xl font-bold text-green-400">{flashcards.filter(f => (f as any).ease_factor > 2.5).length}</div>
          <div className="text-slate-400 text-sm">Padroneggiati</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-3xl font-bold text-amber-400">{flashcards.filter(f => (f as any).repetitions === 0).length}</div>
          <div className="text-slate-400 text-sm">Da ripassare</div>
        </div>
      </div>

      {/* Flashcards Grid */}
      {filteredCards.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-12 text-center">
          <div className="w-20 h-20 bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">🎴</span>
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">Nessuna flashcard</h3>
          <p className="text-slate-400 mb-6">
            {chapters.length === 0
              ? "Elabora prima un capitolo per generare flashcard"
              : "Genera le tue prime flashcard per iniziare a studiare"
            }
          </p>
          {chapters.length > 0 && (
            <button
              onClick={() => setShowGenerateModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
            >
              Genera Flashcards
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCards.map((card) => (
            <div
              key={card.id}
              onClick={() => { setViewingCard(card); setShowAnswer(false); }}
              className="bg-slate-800 border border-slate-700 rounded-xl p-5 cursor-pointer hover:border-purple-500/50 transition-all group"
            >
              <div className="text-purple-400 text-xs mb-2 font-medium">
                {card.chapter?.title || "Capitolo"}
              </div>
              <p className="text-white font-medium line-clamp-3 group-hover:text-purple-300 transition-colors">
                {card.front}
              </p>
              <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
                <span className={`text-xs px-2 py-1 rounded ${
                  card.difficulty === "easy" ? "bg-green-500/20 text-green-400" :
                  card.difficulty === "hard" ? "bg-red-500/20 text-red-400" :
                  "bg-amber-500/20 text-amber-400"
                }`}>
                  {card.difficulty === "easy" ? "Facile" : card.difficulty === "hard" ? "Difficile" : "Media"}
                </span>
                <span className="text-slate-500 text-xs">Clicca per vedere</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Card Modal */}
      {viewingCard && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40" onClick={() => setViewingCard(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl z-50 overflow-hidden">
            <div className="p-6">
              <div className="text-purple-400 text-sm mb-3 font-medium">
                {viewingCard.chapter?.title}
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

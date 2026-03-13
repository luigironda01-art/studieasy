"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter } from "@/lib/supabase";

export default function SourceSummariesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sourceId = params.id as string;

  const [source, setSource] = useState<Source | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [generatingSummary, setGeneratingSummary] = useState<string | null>(null);

  useBreadcrumb(
    source
      ? [
          { label: "I miei libri", href: "/dashboard" },
          { label: source.title, href: `/dashboard/source/${sourceId}` },
          { label: "Riassunti" },
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

      // Fetch chapters with quality info
      const { data: chaptersData } = await supabase
        .from("chapters")
        .select("*")
        .eq("source_id", sourceId)
        .order("order_index");

      if (chaptersData) setChapters(chaptersData);
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const getQualityBadge = (chapter: Chapter) => {
    if (chapter.processing_status !== "completed") {
      return null;
    }

    const quality = chapter.extraction_quality || 0;
    const method = chapter.extraction_method || "text";

    let colorClass = "bg-green-500/20 text-green-400";
    let label = "Eccellente";

    if (quality < 50) {
      colorClass = "bg-red-500/20 text-red-400";
      label = "Parziale";
    } else if (quality < 80) {
      colorClass = "bg-amber-500/20 text-amber-400";
      label = "Buono";
    }

    return (
      <div className="flex items-center gap-2">
        <span className={`px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
          {quality}% - {label}
        </span>
        {method === "vision" && (
          <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">
            Vision AI
          </span>
        )}
      </div>
    );
  };

  const formatProcessedText = (text: string) => {
    return text
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-white mt-6 mb-3">$1</h1>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold text-white mt-5 mb-2">$1</h2>')
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-medium text-white mt-4 mb-2">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*$)/gm, '<li class="ml-4 mb-1">$1</li>')
      .replace(/\n\n/g, '</p><p class="mb-4">');
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const completedChapters = chapters.filter(c => c.processing_status === "completed");

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
              <span className="text-4xl">📖</span>
              Riassunti
            </h1>
            <p className="text-slate-400 mt-1">{source?.title}</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-3xl font-bold text-white">{chapters.length}</div>
          <div className="text-slate-400 text-sm">Capitoli totali</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-3xl font-bold text-green-400">{completedChapters.length}</div>
          <div className="text-slate-400 text-sm">Elaborati</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
          <div className="text-3xl font-bold text-blue-400">
            {completedChapters.reduce((acc, c) => acc + (c.page_count || 0), 0)}
          </div>
          <div className="text-slate-400 text-sm">Pagine totali</div>
        </div>
      </div>

      {/* Chapters List */}
      {chapters.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-12 text-center">
          <div className="w-20 h-20 bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">📖</span>
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">Nessun capitolo</h3>
          <p className="text-slate-400">
            Carica un PDF per iniziare
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Chapters sidebar */}
          <div className="space-y-3">
            <h3 className="text-white font-semibold mb-3">Capitoli</h3>
            {chapters.map((chapter, index) => (
              <button
                key={chapter.id}
                onClick={() => chapter.processing_status === "completed" && setSelectedChapter(chapter)}
                disabled={chapter.processing_status !== "completed"}
                className={`w-full text-left bg-slate-800 border rounded-xl p-4 transition-all ${
                  selectedChapter?.id === chapter.id
                    ? "border-blue-500 bg-blue-500/10"
                    : chapter.processing_status === "completed"
                    ? "border-slate-700 hover:border-slate-600"
                    : "border-slate-700/50 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-sm font-medium text-slate-400 shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium truncate">{chapter.title}</h4>
                    <div className="flex items-center gap-2 mt-2">
                      {chapter.processing_status === "completed" ? (
                        <>
                          {getQualityBadge(chapter)}
                          {chapter.page_count && (
                            <span className="text-slate-500 text-xs">
                              {chapter.page_count} {chapter.page_count === 1 ? "pagina" : "pagine"}
                            </span>
                          )}
                        </>
                      ) : chapter.processing_status === "processing" ? (
                        <span className="px-2 py-1 bg-amber-500/20 text-amber-400 rounded text-xs flex items-center gap-1">
                          <span className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin"></span>
                          Elaborazione...
                        </span>
                      ) : chapter.processing_status === "error" ? (
                        <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">
                          Errore
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-slate-700 text-slate-400 rounded text-xs">
                          In attesa
                        </span>
                      )}
                    </div>
                    {chapter.extraction_notes && (
                      <p className="text-slate-500 text-xs mt-2 truncate" title={chapter.extraction_notes}>
                        {chapter.extraction_notes}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Content viewer */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {selectedChapter ? (
              <div className="h-[600px] flex flex-col">
                <div className="px-5 py-4 border-b border-slate-700">
                  <h3 className="text-white font-semibold">{selectedChapter.title}</h3>
                  <div className="flex items-center gap-3 mt-2">
                    {getQualityBadge(selectedChapter)}
                    {selectedChapter.chars_extracted && (
                      <span className="text-slate-500 text-xs">
                        {(selectedChapter.chars_extracted / 1000).toFixed(1)}k caratteri
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-5">
                  {selectedChapter.processed_text ? (
                    <div
                      className="prose prose-invert prose-slate max-w-none text-slate-300 leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: formatProcessedText(selectedChapter.processed_text)
                      }}
                    />
                  ) : (
                    <div className="text-center py-12 text-slate-400">
                      Contenuto non disponibile
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-[600px] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">👈</span>
                  </div>
                  <p className="text-slate-400">Seleziona un capitolo per visualizzare il riassunto</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

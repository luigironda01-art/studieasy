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

  // Summary generation modal
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateChapterId, setGenerateChapterId] = useState<string>("");
  const [summaryLength, setSummaryLength] = useState<"short" | "medium" | "detailed">("medium");
  const [summaryWords, setSummaryWords] = useState(500);
  const [generating, setGenerating] = useState(false);
  const [generatedSummary, setGeneratedSummary] = useState<string | null>(null);

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
        .order("order_index");

      if (chaptersData) {
        setChapters(chaptersData);
        if (chaptersData.length > 0) {
          setGenerateChapterId(chaptersData[0].id);
        }
      }
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

  // Convert markdown tables to HTML tables
  const formatTables = (text: string): string => {
    const lines = text.split('\n');
    let result: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check if this is a table row (starts and ends with |)
      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        tableRows.push(line);
      } else {
        if (inTable) {
          // End of table, convert to HTML
          result.push(convertTableToHtml(tableRows));
          inTable = false;
          tableRows = [];
        }
        result.push(lines[i]);
      }
    }

    // Handle table at end of text
    if (inTable && tableRows.length > 0) {
      result.push(convertTableToHtml(tableRows));
    }

    return result.join('\n');
  };

  const convertTableToHtml = (rows: string[]): string => {
    if (rows.length < 2) return rows.join('\n');

    // Filter out separator rows (|---|---|)
    const dataRows = rows.filter(row => !row.match(/^\|[\s\-:|]+\|$/));

    if (dataRows.length === 0) return '';

    let html = '<div class="overflow-x-auto my-4"><table class="w-full border-collapse bg-slate-700/30 rounded-lg overflow-hidden">';

    dataRows.forEach((row, idx) => {
      const cells = row.split('|').filter(c => c.trim() !== '');
      const isHeader = idx === 0;
      const tag = isHeader ? 'th' : 'td';
      const cellClass = isHeader
        ? 'px-4 py-3 text-left text-sm font-semibold text-white bg-slate-700'
        : 'px-4 py-3 text-sm text-slate-300 border-t border-slate-600';

      html += '<tr>';
      cells.forEach(cell => {
        html += `<${tag} class="${cellClass}">${cell.trim()}</${tag}>`;
      });
      html += '</tr>';
    });

    html += '</table></div>';
    return html;
  };

  const formatProcessedText = (text: string) => {
    // First convert tables
    let formatted = formatTables(text);

    // Then apply other formatting
    return formatted
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-white mt-6 mb-3">$1</h1>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold text-white mt-5 mb-2">$1</h2>')
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-medium text-white mt-4 mb-2">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*$)/gm, '<li class="ml-4 mb-1">$1</li>')
      .replace(/\n\n/g, '</p><p class="mb-4">');
  };

  const handleDownload = (chapter: Chapter) => {
    if (!chapter.processed_text) return;

    const content = `# ${chapter.title}\n\n${chapter.processed_text}`;
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chapter.title.replace(/[^a-z0-9]/gi, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openGenerateModal = (chapterId: string) => {
    setGenerateChapterId(chapterId);
    setSummaryLength("medium");
    setSummaryWords(500);
    setGeneratedSummary(null);
    setShowGenerateModal(true);
  };

  const handleGenerateSummary = async () => {
    if (!user || !generateChapterId) return;

    setGenerating(true);
    try {
      const response = await fetch("/api/summaries/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: generateChapterId,
          userId: user.id,
          length: summaryLength,
          maxWords: summaryWords,
          language: "it",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Generazione fallita");
      }

      setGeneratedSummary(data.summary);
    } catch (err) {
      console.error("Error generating summary:", err);
    } finally {
      setGenerating(false);
    }
  };

  const downloadGeneratedSummary = () => {
    if (!generatedSummary) return;

    const chapter = chapters.find(c => c.id === generateChapterId);
    const title = chapter?.title || "Riassunto";

    const blob = new Blob([generatedSummary], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Riassunto_${title.replace(/[^a-z0-9]/gi, '_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
              <div
                key={chapter.id}
                className={`bg-slate-800 border rounded-xl p-4 transition-all ${
                  selectedChapter?.id === chapter.id
                    ? "border-blue-500 bg-blue-500/10"
                    : chapter.processing_status === "completed"
                    ? "border-slate-700 hover:border-slate-600"
                    : "border-slate-700/50 opacity-60"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-slate-700 rounded-lg flex items-center justify-center text-sm font-medium text-slate-400 shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => chapter.processing_status === "completed" && setSelectedChapter(chapter)}
                      disabled={chapter.processing_status !== "completed"}
                      className="text-left w-full"
                    >
                      <h4 className="text-white font-medium truncate">{chapter.title}</h4>
                    </button>
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
                    {chapter.processing_status === "completed" && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => setSelectedChapter(chapter)}
                          className="px-3 py-1.5 bg-slate-700 text-white text-xs rounded-lg hover:bg-slate-600 transition-colors"
                        >
                          Visualizza
                        </button>
                        <button
                          onClick={() => openGenerateModal(chapter.id)}
                          className="px-3 py-1.5 bg-blue-500/20 text-blue-400 text-xs rounded-lg hover:bg-blue-500/30 transition-colors"
                        >
                          Genera Riassunto
                        </button>
                        <button
                          onClick={() => handleDownload(chapter)}
                          className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Scarica
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Content viewer */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {selectedChapter ? (
              <div className="h-[600px] flex flex-col">
                <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
                  <div>
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
                  <button
                    onClick={() => handleDownload(selectedChapter)}
                    className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center gap-2 text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Scarica .md
                  </button>
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
                  <p className="text-slate-400">Seleziona un capitolo per visualizzare il contenuto</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generate Summary Modal */}
      {showGenerateModal && (
        <>
          <div className="fixed inset-0 bg-black/70 z-40" onClick={() => !generating && setShowGenerateModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl z-50 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-white text-xl font-semibold mb-2">Genera Riassunto</h3>
              <p className="text-slate-400 text-sm mb-6">
                {chapters.find(c => c.id === generateChapterId)?.title}
              </p>

              {!generatedSummary ? (
                <>
                  {/* Accuracy / Detail Level */}
                  <div className="mb-6">
                    <label className="text-slate-400 text-sm block mb-3">Livello di dettaglio</label>
                    <div className="grid grid-cols-3 gap-3">
                      {([
                        { value: "short", label: "Breve", desc: "Punti chiave", icon: "📝" },
                        { value: "medium", label: "Medio", desc: "Bilanciato", icon: "📄" },
                        { value: "detailed", label: "Dettagliato", desc: "Approfondito", icon: "📚" },
                      ] as const).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setSummaryLength(opt.value)}
                          className={`p-4 rounded-xl border-2 transition-all ${
                            summaryLength === opt.value
                              ? "border-blue-500 bg-blue-500/20"
                              : "border-slate-600 bg-slate-700/50 hover:border-slate-500"
                          }`}
                        >
                          <div className="text-2xl mb-2">{opt.icon}</div>
                          <div className="text-white text-sm font-medium">{opt.label}</div>
                          <div className="text-slate-400 text-xs">{opt.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Word Count */}
                  <div className="mb-6">
                    <label className="text-slate-400 text-sm block mb-3">
                      Lunghezza massima: <span className="text-white font-medium">{summaryWords} parole</span>
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="2000"
                      step="50"
                      value={summaryWords}
                      onChange={(e) => setSummaryWords(Number(e.target.value))}
                      className="w-full accent-blue-500"
                    />
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>100</span>
                      <span>500</span>
                      <span>1000</span>
                      <span>1500</span>
                      <span>2000</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowGenerateModal(false)}
                      disabled={generating}
                      className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors disabled:opacity-50"
                    >
                      Annulla
                    </button>
                    <button
                      onClick={handleGenerateSummary}
                      disabled={generating}
                      className="flex-1 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {generating ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Generando...
                        </>
                      ) : (
                        "Genera Riassunto"
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Generated Summary */}
                  <div className="bg-slate-700/50 rounded-xl p-4 mb-6 max-h-80 overflow-y-auto">
                    <div className="prose prose-invert prose-sm max-w-none">
                      <div
                        className="text-slate-300 leading-relaxed whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{
                          __html: formatProcessedText(generatedSummary)
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setGeneratedSummary(null);
                      }}
                      className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors"
                    >
                      Rigenera
                    </button>
                    <button
                      onClick={downloadGeneratedSummary}
                      className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Scarica
                    </button>
                    <button
                      onClick={() => setShowGenerateModal(false)}
                      className="px-6 py-3 bg-blue-500 text-white rounded-xl font-semibold hover:bg-blue-600 transition-colors"
                    >
                      Chiudi
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

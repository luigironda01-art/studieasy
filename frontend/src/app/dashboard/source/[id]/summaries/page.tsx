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
  const [viewMode, setViewMode] = useState<"list" | "read">("list");

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

  // Convert markdown tables to HTML tables
  const formatTables = (text: string): string => {
    const lines = text.split('\n');
    let result: string[] = [];
    let inTable = false;
    let tableRows: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('|') && line.endsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        tableRows.push(line);
      } else {
        if (inTable) {
          result.push(convertTableToHtml(tableRows));
          inTable = false;
          tableRows = [];
        }
        result.push(lines[i]);
      }
    }

    if (inTable && tableRows.length > 0) {
      result.push(convertTableToHtml(tableRows));
    }

    return result.join('\n');
  };

  const convertTableToHtml = (rows: string[]): string => {
    if (rows.length < 2) return rows.join('\n');

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
    let formatted = formatTables(text);

    return formatted
      .replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold text-white mt-8 mb-4 pb-2 border-b border-slate-700">$1</h1>')
      .replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold text-white mt-6 mb-3">$1</h2>')
      .replace(/^### (.*$)/gm, '<h3 class="text-lg font-medium text-slate-200 mt-5 mb-2">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^- (.*$)/gm, '<li class="ml-4 mb-1.5 text-slate-300">$1</li>')
      .replace(/\n\n/g, '</p><p class="mb-4 text-slate-300 leading-relaxed">');
  };

  const handleDownloadPdf = async (text: string, title: string) => {
    // Dynamic import to avoid SSR issues
    const { jsPDF } = await import("jspdf");

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    // Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    const titleLines = doc.splitTextToSize(title, maxWidth);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 8 + 5;

    // Separator
    doc.setDrawColor(200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Process text - clean markdown for PDF
    const cleanText = text
      .replace(/^#{1,3}\s*/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/^- /gm, '• ')
      .replace(/\|[^\n]+\|/g, '') // Remove table syntax
      .replace(/\n{3,}/g, '\n\n');

    const paragraphs = cleanText.split('\n');

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) {
        y += 4;
        continue;
      }

      // Check if it looks like a heading (all caps or short line)
      const isHeading = trimmed.length < 60 && trimmed === trimmed.replace(/[a-z]/g, '').trim();

      if (isHeading && trimmed.length > 2) {
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
      } else {
        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
      }

      const lines = doc.splitTextToSize(trimmed, maxWidth);

      for (const line of lines) {
        if (y > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 6;
      }
      y += 2;
    }

    // Footer on each page
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(150);
      doc.text(
        `Generato da Backup Buddy - Pagina ${i}/${totalPages}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: "center" }
      );
      doc.setTextColor(0);
    }

    const filename = `${title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
    doc.save(filename);
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

  const openReadMode = (chapter: Chapter) => {
    setSelectedChapter(chapter);
    setViewMode("read");
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const completedChapters = chapters.filter(c => c.processing_status === "completed");

  // Full-screen read mode
  if (viewMode === "read" && selectedChapter) {
    return (
      <div className="min-h-screen bg-[#080c14]">
        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-[#0f172a]/95 backdrop-blur-xl border-b border-white/10 px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <button
              onClick={() => setViewMode("list")}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Torna ai riassunti
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleDownloadPdf(
                  selectedChapter.processed_text || "",
                  selectedChapter.title
                )}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Scarica PDF
              </button>
              <button
                onClick={() => openGenerateModal(selectedChapter.id)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm"
              >
                Genera Riassunto AI
              </button>
            </div>
          </div>
        </div>

        {/* Full-screen content */}
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-white mb-2">{selectedChapter.title}</h1>
            <p className="text-slate-400">{source?.title}</p>
            {selectedChapter.page_count && (
              <p className="text-slate-500 text-sm mt-1">{selectedChapter.page_count} pagine</p>
            )}
          </div>

          {selectedChapter.processed_text ? (
            <article className="prose prose-invert prose-slate max-w-none">
              <div
                className="text-slate-300 leading-relaxed text-[16px]"
                dangerouslySetInnerHTML={{
                  __html: formatProcessedText(selectedChapter.processed_text)
                }}
              />
            </article>
          ) : (
            <div className="text-center py-12 text-slate-400">
              Contenuto non disponibile
            </div>
          )}
        </div>

        {/* Generate Summary Modal */}
        {renderGenerateModal()}
      </div>
    );
  }

  // List mode (default)
  function renderGenerateModal() {
    if (!showGenerateModal) return null;

    return (
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
                <div className="bg-slate-700/50 rounded-xl p-5 mb-6 max-h-96 overflow-y-auto">
                  <div className="prose prose-invert prose-sm max-w-none">
                    <div
                      className="text-slate-300 leading-relaxed"
                      dangerouslySetInnerHTML={{
                        __html: formatProcessedText(generatedSummary)
                      }}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setGeneratedSummary(null)}
                    className="flex-1 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors"
                  >
                    Rigenera
                  </button>
                  <button
                    onClick={() => {
                      const chapter = chapters.find(c => c.id === generateChapterId);
                      handleDownloadPdf(generatedSummary, `Riassunto - ${chapter?.title || "Documento"}`);
                    }}
                    className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Scarica PDF
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
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
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

        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <span className="text-4xl">📖</span>
          Riassunti
        </h1>
        <p className="text-slate-400 mt-1">{source?.title}</p>
      </div>

      {/* Chapters List */}
      {completedChapters.length === 0 ? (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-12 text-center">
          <div className="w-20 h-20 bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-4xl">📖</span>
          </div>
          <h3 className="text-white font-semibold text-lg mb-2">Nessun contenuto disponibile</h3>
          <p className="text-slate-400">
            Elabora un PDF per poter generare riassunti
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {completedChapters.map((chapter) => (
            <div
              key={chapter.id}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center">
                    <span className="text-2xl">📄</span>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg">{chapter.title}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      {chapter.page_count && (
                        <span className="text-slate-500 text-sm">
                          {chapter.page_count} pagine
                        </span>
                      )}
                      {chapter.extraction_method && chapter.extraction_method !== "text" && (
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs">
                          Vision AI
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openReadMode(chapter)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors text-sm font-medium"
                  >
                    <span>📖</span>
                    Leggi
                  </button>
                  <button
                    onClick={() => openGenerateModal(chapter.id)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                  >
                    Genera Riassunto
                  </button>
                  <button
                    onClick={() => handleDownloadPdf(
                      chapter.processed_text || "",
                      chapter.title
                    )}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm"
                    title="Scarica come PDF"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    PDF
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Generate Summary Modal */}
      {renderGenerateModal()}
    </div>
  );
}

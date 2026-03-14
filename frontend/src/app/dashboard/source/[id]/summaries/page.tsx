"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter } from "@/lib/supabase";

// PDF block types
interface PdfBlock {
  type: "h1" | "h2" | "h3" | "paragraph" | "list" | "empty" | "table" | "image";
  text: string;
  rows?: string[][];
}

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

  // PDF generation progress
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");

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

  // Parse markdown text into structured blocks for PDF rendering
  const parseMarkdownBlocks = (text: string): PdfBlock[] => {
    // ═══ Step 1: Heavy pre-processing ═══

    // 1a. Join multiline [IMMAGINE: ...] blocks into single lines
    let cleaned = text.replace(/\[IMMAGINE:\s*([\s\S]*?)\]/gi, (_m, desc: string) => {
      const single = desc.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
      return `[IMMAGINE: ${single}]`;
    });

    // 1b. Remove markdown code fences
    cleaned = cleaned.replace(/```(?:markdown|text)?\s*/gi, "");

    // 1c. Remove horizontal rules
    cleaned = cleaned.replace(/^[-_*]{3,}\s*$/gm, "");

    // 1d. Fix spaced-out text using line-level heuristic
    // If >50% of space-separated tokens in a line are single chars, it's spaced text
    // Double-space = word boundary, single-space = letter spacing
    cleaned = cleaned.split("\n").map((line: string) => {
      const tokens = line.split(" ").filter((t: string) => t !== "");
      if (tokens.length < 6) return line;
      const singleCharCount = tokens.filter((t: string) => t.length === 1).length;
      if (singleCharCount / tokens.length > 0.5) {
        const parts = line.split(/  +/);
        if (parts.length <= 1) {
          return line.replace(/ /g, "");
        }
        return parts.map((w: string) => w.replace(/ /g, "")).join(" ");
      }
      return line;
    }).join("\n");

    // 1e. Clean %ª bullet markers → bullet (with optional leading whitespace)
    cleaned = cleaned.replace(/^\s*%ª\s*/gm, "- ");

    // 1e2. Clean ▪ (U+25AA) bullet markers → bullet
    cleaned = cleaned.replace(/^\s*▪\s*/gm, "- ");

    // 1f. Clean [FORMULA: x] → x
    cleaned = cleaned.replace(/\[FORMULA:\s*(.*?)\]/gi, "$1");

    // 1g. Remove orphan markdown bold/italic
    cleaned = cleaned.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1");

    // 1h. Remove standalone http URLs (may contain spaces from broken PDF extraction)
    cleaned = cleaned.replace(/^https?:\/\/.*$/gm, "");

    // ═══ Step 2: Line-by-line parsing ═══
    const lines = cleaned.split("\n");
    const blocks: PdfBlock[] = [];
    let tableRows: string[][] = [];
    let inTable = false;
    let skipIllustration = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip verbose "Illustrazione:" description blocks from Vision AI
      if (skipIllustration) {
        if (
          !line ||
          line.startsWith("[") ||
          line.startsWith("#") ||
          line.startsWith("-") ||
          line.startsWith("•")
        ) {
          skipIllustration = false;
          // Fall through to process this line normally
        } else {
          continue; // Skip — part of illustration description
        }
      }

      // Detect "Illustrazione:" standalone descriptions — skip entirely
      if (
        line.startsWith("Illustrazione:") ||
        line.startsWith("Illustrazione :") ||
        line.startsWith("Figure modificate da")
      ) {
        skipIllustration = true;
        continue;
      }

      // Table detection: lines with 2+ pipe chars (with OR without leading |)
      const pipeCount = (line.match(/\|/g) || []).length;
      if (pipeCount >= 2) {
        // Skip separator rows like |---|---|--- or --- | --- | ---
        if (!line.match(/^[\s|:\-]+$/)) {
          const cells = line
            .split("|")
            .map((c) => c.trim())
            .filter((c) => c !== "");
          if (cells.length >= 2) {
            tableRows.push(cells);
          }
        }
        inTable = true;
        continue;
      }

      // End of table block
      if (inTable) {
        if (tableRows.length > 0) {
          blocks.push({ type: "table", text: "", rows: [...tableRows] });
        }
        tableRows = [];
        inTable = false;
      }

      // Empty line
      if (!line) {
        blocks.push({ type: "empty", text: "" });
        continue;
      }

      // [IMMAGINE: description] tags
      const imageMatch = line.match(/\[IMMAGINE:\s*(.*?)\]/i);
      if (imageMatch) {
        // Extract just the first sentence as a brief description
        const fullDesc = imageMatch[1];
        const brief =
          fullDesc.length > 100
            ? fullDesc.substring(0, 100).replace(/\s\S*$/, "") + "..."
            : fullDesc;
        blocks.push({ type: "image", text: brief });
        continue;
      }

      // Skip lines that are just "[IMMAGINE:" without closing bracket (multiline start)
      if (line.match(/^\[IMMAGINE:/i)) {
        continue;
      }

      // Markdown headings
      if (line.startsWith("### ")) {
        blocks.push({ type: "h3", text: line.replace(/^###\s+/, "") });
      } else if (line.startsWith("## ")) {
        blocks.push({ type: "h2", text: line.replace(/^##\s+/, "") });
      } else if (line.startsWith("# ")) {
        blocks.push({ type: "h1", text: line.replace(/^#\s+/, "") });
      }
      // Bullet lists (-, *, •)
      else if (line.match(/^[-*•]\s/)) {
        blocks.push({ type: "list", text: line.replace(/^[-*•]\s+/, "") });
      }
      // Numbered lists
      else if (line.match(/^\d+[.)]\s/)) {
        blocks.push({ type: "list", text: line });
      }
      // Plain text heading: ALL CAPS, short, has letters, no ending punctuation
      else if (
        line.length > 3 &&
        line.length < 80 &&
        line === line.toUpperCase() &&
        /[A-ZÀ-Ú]/.test(line) &&
        !/[.;,]$/.test(line)
      ) {
        blocks.push({ type: "h1", text: line });
      }
      // Plain text heading: short line after blank, no ending punctuation, next line longer
      else if (
        line.length > 3 &&
        line.length < 70 &&
        !/[.;,:)']$/.test(line) &&
        (blocks.length === 0 ||
          blocks[blocks.length - 1].type === "empty") &&
        i + 1 < lines.length &&
        lines[i + 1].trim().length > line.length
      ) {
        blocks.push({ type: "h2", text: line });
      }
      // Regular paragraph
      else {
        blocks.push({ type: "paragraph", text: line });
      }
    }

    // Remaining table
    if (inTable && tableRows.length > 0) {
      blocks.push({ type: "table", text: "", rows: [...tableRows] });
    }

    return blocks;
  };


  const handleDownloadPdf = async (text: string, title: string, chapterId?: string) => {
    setPdfGenerating(true);
    setPdfProgress("Caricamento dati aggiornati...");

    try {
      // Re-fetch fresh chapter data via server-side POST API (service role key, no RLS)
      let freshText = text;
      if (chapterId) {
        try {
          const res = await fetch("/api/chapters/fresh-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chapterId }),
          });
          if (res.ok) {
            const json = await res.json();
            if (json.processed_text) {
              freshText = json.processed_text;
              console.log("[PDF] Fresh text OK, length:", freshText.length);
            }
          } else {
            console.warn("[PDF] Fresh fetch failed:", res.status);
          }
        } catch (fetchErr) {
          console.warn("[PDF] Fresh fetch error:", fetchErr);
        }
      }

      setPdfProgress("Analisi del documento...");
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

      const blocks = parseMarkdownBlocks(freshText);

      // Image generation disabled — too expensive per PDF
      const imageMap: Record<string, string> = {};

      setPdfProgress("Creazione PDF...");

      // Helper: check page break and add new page if needed
      const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      };

      // ── Document Title ──
      doc.setFontSize(22);
      doc.setFont("helvetica", "bold");
      const titleLines = doc.splitTextToSize(title, maxWidth);
      for (const tl of titleLines) {
        ensureSpace(10);
        doc.text(tl, margin, y);
        y += 9;
      }
      y += 2;

      // Title underline
      doc.setDrawColor(60, 60, 60);
      doc.setLineWidth(0.6);
      doc.line(margin, y, pageWidth - margin, y);
      y += 12;

      // ── Render blocks ──
      for (const block of blocks) {
        switch (block.type) {
          case "h1": {
            ensureSpace(16);
            y += 6;
            doc.setFontSize(16);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(0);
            const h1Lines = doc.splitTextToSize(block.text, maxWidth);
            for (const line of h1Lines) {
              ensureSpace(8);
              doc.text(line, margin, y);
              y += 7;
            }
            // Underline for h1
            doc.setDrawColor(180);
            doc.setLineWidth(0.3);
            doc.line(margin, y + 1, pageWidth - margin, y + 1);
            y += 6;
            break;
          }

          case "h2": {
            ensureSpace(14);
            y += 4;
            doc.setFontSize(13);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(30, 30, 30);
            const h2Lines = doc.splitTextToSize(block.text, maxWidth);
            for (const line of h2Lines) {
              ensureSpace(7);
              doc.text(line, margin, y);
              y += 6.5;
            }
            y += 3;
            doc.setTextColor(0);
            break;
          }

          case "h3": {
            ensureSpace(12);
            y += 3;
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(50, 50, 50);
            const h3Lines = doc.splitTextToSize(block.text, maxWidth);
            for (const line of h3Lines) {
              ensureSpace(6);
              doc.text(line, margin, y);
              y += 6;
            }
            y += 2;
            doc.setTextColor(0);
            break;
          }

          case "list": {
            doc.setFontSize(10.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(30, 30, 30);
            const bulletChar = "\u2022";
            const indentFirst = margin + 4;
            const indentWrap = margin + 8;
            const cleanItem = block.text
              .replace(/\*\*(.*?)\*\*/g, "$1")
              .replace(/\*(.*?)\*/g, "$1");
            const listLines = doc.splitTextToSize(cleanItem, maxWidth - 10);
            for (let li = 0; li < listLines.length; li++) {
              ensureSpace(6);
              if (li === 0) {
                doc.text(bulletChar, margin, y);
                doc.text(listLines[li], indentFirst, y);
              } else {
                doc.text(listLines[li], indentWrap, y);
              }
              y += 5.5;
            }
            y += 1;
            doc.setTextColor(0);
            break;
          }

          case "table": {
            if (block.rows && block.rows.length > 0) {
              ensureSpace(14);
              y += 2;
              const colCount = Math.max(
                ...block.rows.map((r) => r.length)
              );
              const cellWidth = maxWidth / colCount;
              const cellPadding = 2;
              const rowHeight = 7;

              doc.setFontSize(9);

              for (
                let rowIdx = 0;
                rowIdx < block.rows.length;
                rowIdx++
              ) {
                ensureSpace(rowHeight + 2);
                const isHeader = rowIdx === 0;
                const row = block.rows[rowIdx];

                for (let colIdx = 0; colIdx < colCount; colIdx++) {
                  const cellX = margin + colIdx * cellWidth;

                  // Header background
                  if (isHeader) {
                    doc.setFillColor(230, 230, 240);
                    doc.rect(cellX, y - 5, cellWidth, rowHeight, "F");
                    doc.setFont("helvetica", "bold");
                  } else {
                    if (rowIdx % 2 === 0) {
                      doc.setFillColor(248, 248, 252);
                      doc.rect(cellX, y - 5, cellWidth, rowHeight, "F");
                    }
                    doc.setFont("helvetica", "normal");
                  }

                  // Cell border
                  doc.setDrawColor(180, 180, 200);
                  doc.setLineWidth(0.2);
                  doc.rect(cellX, y - 5, cellWidth, rowHeight);

                  // Cell text
                  doc.setTextColor(30, 30, 30);
                  const cellText = (row[colIdx] || "")
                    .replace(/\*\*(.*?)\*\*/g, "$1")
                    .replace(/\*(.*?)\*/g, "$1");
                  const truncated = doc.splitTextToSize(
                    cellText,
                    cellWidth - cellPadding * 2
                  );
                  doc.text(
                    truncated[0] || "",
                    cellX + cellPadding,
                    y
                  );
                }

                y += rowHeight;
              }
              y += 5;
              doc.setTextColor(0);
            }
            break;
          }

          case "image": {
            const imgBase64 = imageMap[block.text];
            if (imgBase64) {
              // Embed generated image
              const imgWidth = maxWidth * 0.7;
              const imgHeight = imgWidth * 0.6;
              ensureSpace(imgHeight + 12);
              const imgX = margin + (maxWidth - imgWidth) / 2;
              try {
                doc.addImage(
                  `data:image/png;base64,${imgBase64}`,
                  "PNG",
                  imgX,
                  y,
                  imgWidth,
                  imgHeight
                );
                y += imgHeight + 2;
                // Brief caption under image
                doc.setFontSize(8);
                doc.setFont("helvetica", "italic");
                doc.setTextColor(120);
                doc.text(block.text, pageWidth / 2, y, {
                  align: "center",
                });
                y += 6;
                doc.setTextColor(0);
              } catch {
                // Skip if embedding fails
                y += 2;
              }
            } else {
              // No image generated — just a brief italic note
              ensureSpace(8);
              doc.setFontSize(8.5);
              doc.setFont("helvetica", "italic");
              doc.setTextColor(130);
              doc.text(
                `[Vedi figura: ${block.text}]`,
                margin,
                y
              );
              y += 6;
              doc.setTextColor(0);
            }
            break;
          }

          case "paragraph": {
            doc.setFontSize(10.5);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(30, 30, 30);
            // Strip remaining markdown
            const cleanPara = block.text
              .replace(/\*\*(.*?)\*\*/g, "$1")
              .replace(/\*(.*?)\*/g, "$1");
            const paraLines = doc.splitTextToSize(cleanPara, maxWidth);
            for (const line of paraLines) {
              ensureSpace(6);
              doc.text(line, margin, y);
              y += 5.5;
            }
            y += 3;
            doc.setTextColor(0);
            break;
          }

          case "empty":
            y += 2;
            break;
        }
      }

      // ── Footer on each page ──
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150);
        doc.text(
          `Generato da Backup Buddy v3 — Pagina ${i}/${totalPages}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: "center" }
        );
        doc.setTextColor(0);
      }

      const filename = `${title.replace(/[^a-z0-9]/gi, "_")}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error("PDF generation error:", err);
    } finally {
      setPdfGenerating(false);
      setPdfProgress("");
    }
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
                  selectedChapter.title,
                  selectedChapter.id
                )}
                disabled={pdfGenerating}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pdfGenerating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></span>
                    {pdfProgress || "Generando..."}
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Scarica PDF
                  </>
                )}
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

        {/* PDF Generation Progress Overlay */}
        {pdfGenerating && (
          <>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl text-center min-w-[320px]">
                <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <h3 className="text-white font-semibold text-lg mb-2">Generazione PDF</h3>
                <p className="text-slate-400 text-sm">{pdfProgress || "Preparazione..."}</p>
              </div>
            </div>
          </>
        )}
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
                {/* Detail Level */}
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
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-12 text-center">
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
              className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 hover:border-blue-500/30 transition-all"
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
                      chapter.title,
                      chapter.id
                    )}
                    disabled={pdfGenerating}
                    className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* PDF Generation Progress Overlay */}
      {pdfGenerating && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 shadow-2xl text-center min-w-[320px]">
              <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <h3 className="text-white font-semibold text-lg mb-2">Generazione PDF</h3>
              <p className="text-slate-400 text-sm">{pdfProgress || "Preparazione..."}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter } from "@/lib/supabase";

// PDF block types
interface PdfBlock {
  type: "h1" | "h2" | "h3" | "paragraph" | "list" | "empty" | "table" | "image" | "latex";
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
  const [chapterSummaries, setChapterSummaries] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "read">("list");
  const [summaryView, setSummaryView] = useState<"full" | "chapters">("chapters");

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
  const [includeImages, setIncludeImages] = useState(true);

  // Bulk summary generation
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, chapterName: "" });

  // Pre-generated summary images
  const [summaryImages, setSummaryImages] = useState<Array<{
    id: string;
    title: string;
    description: string;
    image_url: string;
    position_index: number;
    anchor_text: string | null;
  }>>([]);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [imageProgress, setImageProgress] = useState({ step: "", current: 0, total: 0 });

  // PDF download confirmation dialog (for full book without images)
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [pendingPdfArgs, setPendingPdfArgs] = useState<{
    text: string;
    title: string;
    chapterId?: string;
  } | null>(null);

  const requestPdfDownload = (text: string, title: string, chapterId?: string) => {
    // Full book PDF without pre-generated images → show info dialog
    const isFullBook = !chapterId;
    const hasPreGenImages = summaryImages.length > 0;

    if (isFullBook && !hasPreGenImages) {
      setPendingPdfArgs({ text, title, chapterId });
      setShowPdfDialog(true);
      return;
    }

    // Otherwise download directly (with images if pre-generated, on-the-fly for chapters)
    handleDownloadPdf(text, title, chapterId, true);
  };

  const confirmPdfDownload = () => {
    if (pendingPdfArgs) {
      handleDownloadPdf(pendingPdfArgs.text, pendingPdfArgs.title, pendingPdfArgs.chapterId, false);
    }
    setShowPdfDialog(false);
    setPendingPdfArgs(null);
  };

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

        // Fetch existing summaries for all chapters
        const chapterIds = chaptersData.map(c => c.id);
        if (chapterIds.length > 0) {
          const { data: summariesData } = await supabase
            .from("summaries")
            .select("chapter_id, content")
            .in("chapter_id", chapterIds);

          if (summariesData) {
            const summaryMap: Record<string, string> = {};
            for (const s of summariesData) {
              summaryMap[s.chapter_id] = s.content;
            }
            setChapterSummaries(summaryMap);
          }
        }
      }

      // Fetch existing pre-generated summary images
      try {
        const imgRes = await fetch(`/api/images/generate-for-summary?sourceId=${sourceId}`);
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          if (imgData.images) setSummaryImages(imgData.images);
        }
      } catch { /* ignore */ }
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

    // 1a2. Ensure $$...$$ LaTeX blocks are on their own lines
    // This prevents formulas with | (absolute value) from being parsed as table rows
    // Handle both single-line $$...$$ and multi-line $$ ... $$
    cleaned = cleaned.replace(/^(.+?)(\$\$(?:[^$]|\$(?!\$))+\$\$)(.*)$/gm, (_m, before: string, formula: string, after: string) => {
      let result = "";
      if (before.trim()) result += before.trimEnd() + "\n";
      result += formula;
      if (after.trim()) result += "\n" + after.trimStart();
      return result;
    });

    // 1b. Remove markdown code fences
    cleaned = cleaned.replace(/```(?:markdown|text)?\s*/gi, "");

    // 1c. Remove horizontal rules
    cleaned = cleaned.replace(/^[-_*]{3,}\s*$/gm, "");

    // 1c2. Normalize all Unicode whitespace to regular spaces (non-breaking space, thin space, etc.)
    cleaned = cleaned.replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ");

    // 1c2b. Fix common chemical formulas: H2O → H₂O, CO2 → CO₂, etc.
    const formulaMap: Record<string, string> = {
      "H2O": "H₂O", "CO2": "CO₂", "O2": "O₂", "N2": "N₂", "H2": "H₂",
      "SO4": "SO₄", "NO3": "NO₃", "NH3": "NH₃", "CH4": "CH₄",
      "C6H12O6": "C₆H₁₂O₆", "Na+": "Na⁺", "Cl-": "Cl⁻",
      "Ca2+": "Ca²⁺", "Mg2+": "Mg²⁺", "Fe2+": "Fe²⁺", "Fe3+": "Fe³⁺",
      "OH-": "OH⁻", "H+": "H⁺", "H3O+": "H₃O⁺",
      "NaCl": "NaCl", "H2SO4": "H₂SO₄", "HCl": "HCl",
    };
    for (const [plain, unicode] of Object.entries(formulaMap)) {
      // Only replace when it's a standalone formula (not part of a longer word)
      const escaped = plain.replace(/[+\-]/g, "\\$&");
      cleaned = cleaned.replace(new RegExp(`\\b${escaped}\\b`, "g"), unicode);
    }
    // Fix "H ,O" pattern (corrupted subscript)
    cleaned = cleaned.replace(/H\s*,\s*O/g, "H₂O");
    // Fix "CO ," pattern (corrupted CO₂ subscript)
    cleaned = cleaned.replace(/\bCO\s*,(?=\s|[).\]])/g, "CO₂");
    // Fix corrupted delta symbols: (´-) → δ⁻, (´+) → δ⁺
    cleaned = cleaned.replace(/\(?\s*´\s*-\s*\)?/g, "δ⁻");
    cleaned = cleaned.replace(/\(?\s*´\s*\+\s*\)?/g, "δ⁺");
    // Fix alfa/beta with wrong symbols
    cleaned = cleaned.replace(/alfa\s*\(±\)/gi, "alfa (α)");
    cleaned = cleaned.replace(/beta\s*\(²\)/gi, "beta (β)");
    cleaned = cleaned.replace(/\(±\)/g, "(α)");
    cleaned = cleaned.replace(/\(²\)/g, "(β)");
    // Fix standalone ± and ² used as α and β in chemistry/biology context
    // ±-elica → α-elica, ²-foglietto → β-foglietto, ±(1→4) → α(1→4)
    cleaned = cleaned.replace(/±-/g, "α-");
    cleaned = cleaned.replace(/²-/g, "β-");
    cleaned = cleaned.replace(/±\s*\(/g, "α(");
    cleaned = cleaned.replace(/,\s*²\s*\(/g, ", β(");
    cleaned = cleaned.replace(/²\s*\(/g, "β(");
    // Generic standalone ± → α and ² → β when near biology terms
    cleaned = cleaned.replace(/\b±\b/g, "α");
    cleaned = cleaned.replace(/(?<=[,\s])²(?=[,\s(])/g, "β");

    // 1c2c. Fix missing space before parenthesis: "Carbonio(C)" → "Carbonio (C)"
    cleaned = cleaned.replace(/([a-zà-ÿA-ZÀ-Ÿ])\(([A-Za-z])/g, "$1 ($2");

    // 1c2d. Fix completely glued text (entire sentences without spaces)
    // Detect lines where letter-density is very high (few/no spaces relative to length)
    // and attempt to split them using common Italian patterns
    cleaned = cleaned.split("\n").map((line: string) => {
      const trimmed = line.trim();
      if (trimmed.length < 20) return line; // too short
      if (trimmed.startsWith("#") || trimmed.startsWith("[")) return line; // skip headings/tags

      const letterCount = (trimmed.match(/[a-zA-Zà-ÿÀ-Ÿ]/g) || []).length;
      const spaceCount = (trimmed.match(/ /g) || []).length;
      const ratio = spaceCount / trimmed.length;

      // A normal Italian sentence has ~1 space per 5-6 chars (ratio ~0.17)
      // Glued text has ratio < 0.03
      if (ratio > 0.05 || letterCount < 15) return line;

      // This line is likely glued — apply aggressive splitting
      let fixed = trimmed;

      // Split lowercase followed by uppercase: "carbonioacui" → "carbonio Acui" (then lowercase→uppercase handles rest)
      fixed = fixed.replace(/([a-zà-ÿ])([A-ZÀ-Ÿ])/g, "$1 $2");

      // Split after punctuation followed by letter: "nucleico).Ogni" → "nucleico). Ogni"
      fixed = fixed.replace(/([.!?;:,])([a-zA-Zà-ÿÀ-Ÿ])/g, "$1 $2");

      // Split number-letter boundaries: "3atomi" → "3 atomi"
      fixed = fixed.replace(/(\d)([a-zA-Zà-ÿ])/g, "$1 $2");
      fixed = fixed.replace(/([a-zà-ÿ])(\d)/g, "$1 $2");

      // If still very few spaces, apply Italian word boundary heuristics
      const newSpaces = (fixed.match(/ /g) || []).length;
      if (newSpaces / fixed.length < 0.08 && fixed.length > 30) {
        // Split around "è" (almost always a standalone word in Italian)
        fixed = fixed.replace(/([a-zA-Zà-ÿÀ-Ÿ])(è)([a-zà-ÿ])/g, "$1 $2 $3");
        // Only use 4+ letter small words to avoid false positives inside words
        // (e.g. "lo" inside "glicerolo", "la" inside "alcoola")
        const longWords = /(?<=[a-zà-ÿ])((?:della|delle|dello|degli|alla|alle|allo|dalla|dalle|nella|nelle|nello|sono|come|anche|ogni|questo|questa|questi|queste|hanno|essere|molto|dopo|prima|dove|quando|mentre|senza|verso|sopra|sotto|dentro|fuori|circa|durante|secondo|mediante|attraverso|tipicamente|struttur[ae]|present[ai]|livello|molecol[ae]|formano|support[oi]|forma|process[oi]|funzion[ie]|organic[aoi]|divers[aei]|chimich[ei]|important[ei]|fondamental[ei]|cellul[ae]|regolan[oi]|ormoni|biologici|fisiologic[oi])(?=[a-zà-ÿ]))/gi;
        fixed = fixed.replace(longWords, " $1");
      }

      // Clean up multiple spaces
      fixed = fixed.replace(/\s{2,}/g, " ");

      return line.startsWith(" ") ? " " + fixed : fixed;
    }).join("\n");

    // Fix known compound words (after glued text fix, these may appear)
    cleaned = cleaned.replace(/Essereumano/g, "Essere umano");
    cleaned = cleaned.replace(/Erbamedica/g, "Erba medica");
    cleaned = cleaned.replace(/Altamenteramificato/g, "Altamente ramificato");

    // 1c3. Fix spaced-out [Vedi figura:] and [IMMAGINE:] tags (e.g. "[ V e d i f i g u r a :")
    cleaned = cleaned.replace(/\[\s*V\s*e\s*d\s*i\s*f\s*i\s*g\s*u\s*r\s*a\s*:/gi, "[Vedi figura:");
    cleaned = cleaned.replace(/\[\s*I\s*M\s*M\s*A\s*G\s*I\s*N\s*E\s*:/gi, "[IMMAGINE:");

    // 1d. Fix spaced-out text using line-level heuristic
    // Spaced-out text looks like "m o l e c o l a  p o l a r e" — nearly ALL tokens are single chars
    // Italian has many 1-char words (è, e, a, o, i) so we need a HIGH threshold
    cleaned = cleaned.split("\n").map((line: string) => {
      // Skip lines that are headings, tags, or very short
      if (line.trim().startsWith("#") || line.trim().startsWith("[") || line.trim().length < 4) return line;

      const tokens = line.split(/\s+/).filter((t: string) => t !== "");
      if (tokens.length < 4) return line;

      // Exclude known Italian words and bullets from "single char" count
      const italianSingleWords = new Set(["è", "e", "a", "o", "i", "-", "*", "•"]);
      const trueSingleCharCount = tokens.filter(
        (t: string) => t.length === 1 && !italianSingleWords.has(t)
      ).length;

      // Only trigger if >50% of tokens are TRULY single chars (not Italian words)
      // Real spaced-out text has 80-100% single chars
      if (trueSingleCharCount / tokens.length > 0.50) {
        // Use double-space (or more) as word boundaries
        const parts = line.split(/\s{2,}/);
        if (parts.length <= 1) {
          // No word boundaries found — collapse all spaces
          return line.replace(/\s+/g, "");
        }
        return parts.map((w: string) => w.replace(/\s/g, "")).join(" ");
      }
      // Also detect: sequences of single chars separated by spaces (partial spaced text within a line)
      // e.g. "la rende una m o l e c o l a  p o l a r e. L'atomo..."
      // For 6+ consecutive single chars: ALWAYS collapse (no Italian sentence has 6+ single-letter words in a row)
      let fixedLine = line.replace(/(\b[a-zA-Zà-ÿ]\s){6,}[a-zA-Zà-ÿ]\b/g, (match) => {
        const words = match.split(/\s{2,}/);
        if (words.length > 1) {
          return words.map((w: string) => w.replace(/\s/g, "")).join(" ");
        }
        return match.replace(/\s/g, "");
      });
      // For 4-5 consecutive single chars: check if mostly non-Italian
      return fixedLine.replace(/(\b[a-zA-Zà-ÿ]\s){3,5}[a-zA-Zà-ÿ]\b/g, (match) => {
        const chars = match.split(/\s+/);
        const nonItalianSingles = chars.filter(
          (c: string) => c.length === 1 && !italianSingleWords.has(c)
        ).length;
        if (nonItalianSingles > chars.length * 0.5) {
          const words = match.split(/\s{2,}/);
          if (words.length > 1) {
            return words.map((w: string) => w.replace(/\s/g, "")).join(" ");
          }
          return match.replace(/\s/g, "");
        }
        return match;
      });
    }).join("\n");

    // 1e. Clean %ª bullet markers → bullet (with optional leading whitespace)
    cleaned = cleaned.replace(/^\s*%ª\s*/gm, "- ");

    // 1e2. Clean ▪ (U+25AA) bullet markers → bullet
    cleaned = cleaned.replace(/^\s*▪\s*/gm, "- ");

    // 1e3. Fix spaces after apostrophes: "L' acqua" → "L'acqua", "all' elevato" → "all'elevato"
    cleaned = cleaned.replace(/(\w)'\s+(\w)/g, "$1'$2");

    // 1e4. Fix spaces before accented characters: "Propriet à" → "Proprietà"
    cleaned = cleaned.replace(/(\w)\s+(à|è|ù|ò|ì|é|ó|ú|í)/g, "$1$2");

    // 1e4b. Fix glued "è" (Italian verb "is"): "palladioè" → "palladio è"
    // Safe: Italian words ending in grave-è are short (caffè, tè, cioè = max 4 chars before è)
    cleaned = cleaned.replace(/([a-zà-ùA-ZÀ-Ù]{5,})(è)(?=\s|[,.:;!?]|$)/g, "$1 $2");

    // 1e5. Remove AI truncation artifacts
    cleaned = cleaned.replace(/\(CONTINUA NELLA PROSSIMA RISPOSTA.*?\)/gi, "");
    cleaned = cleaned.replace(/\(CONTINUA.*?CARATTERI.*?\)/gi, "");

    // 1e6. Remove duplicate consecutive headings (same text repeated)
    cleaned = cleaned.split("\n").map((line: string, idx: number, arr: string[]) => {
      const trimmed = line.trim();
      if (idx > 0 && trimmed.length > 0) {
        const prevTrimmed = arr[idx - 1].trim();
        // Skip if current line is identical to previous (duplicate heading/paragraph)
        if (trimmed === prevTrimmed) return "";
        // Also catch heading followed by same text without # prefix
        if (prevTrimmed.startsWith("#") && prevTrimmed.replace(/^#+\s*/, "") === trimmed) return "";
        if (trimmed.startsWith("#") && trimmed.replace(/^#+\s*/, "") === prevTrimmed) return "";
      }
      return line;
    }).join("\n");

    // 1f. Clean [FORMULA: x] → x
    cleaned = cleaned.replace(/\[FORMULA:\s*(.*?)\]/gi, "$1");

    // 1f2. Clean backslash escapes from markdown (e.g. \*text, \\text, \\\text)
    cleaned = cleaned.replace(/^\\+/gm, "");

    // 1f3. Remove AI prompt artifacts (Vision AI response preamble)
    cleaned = cleaned.replace(/^Ecco il contenuto (?:testuale )?estratto dai documenti.*$/gim, "");
    cleaned = cleaned.replace(/^Restituisci il contenuto completo.*$/gim, "");

    // 1g. Remove orphan markdown bold/italic
    cleaned = cleaned.replace(/\*{1,3}([^*\n]+)\*{1,3}/g, "$1");

    // 1h. Remove standalone http URLs (may contain spaces from broken PDF extraction)
    cleaned = cleaned.replace(/^https?:\/\/.*$/gm, "");

    // 1i. Join broken lines into paragraphs
    // PDF extraction creates newlines at the end of each page line (~60 chars).
    // Merge consecutive non-empty lines that are clearly part of the same paragraph.
    const rawLines = cleaned.split("\n");
    const joined: string[] = [];
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      // Keep empty lines, headings, tables, image tags, LaTeX blocks as-is (start new line)
      if (
        !trimmed ||
        trimmed.startsWith("#") ||
        trimmed.match(/\|.*\|/) ||
        trimmed.startsWith("[IMMAGINE:") ||
        trimmed.startsWith("[Vedi figura:") ||
        trimmed.startsWith("Illustrazione") ||
        trimmed.startsWith("$$") ||
        trimmed.endsWith("$$")
      ) {
        joined.push(line);
        continue;
      }

      // NEW bullet/list item: starts new line
      if (
        trimmed.startsWith("-") ||
        trimmed.startsWith("•") ||
        trimmed.startsWith("*") ||
        trimmed.match(/^\d+[.)]\s/)
      ) {
        joined.push(line);
        continue;
      }

      // Check if this line should merge with the previous non-empty line
      const prevIdx = joined.length - 1;
      if (prevIdx >= 0) {
        const prev = joined[prevIdx].trim();

        // Can't merge with empty, headings, tables, images, LaTeX
        if (
          !prev ||
          prev.startsWith("#") ||
          prev.match(/\|.*\|/) ||
          prev.startsWith("[IMMAGINE:") ||
          prev.startsWith("[Vedi figura:") ||
          prev.startsWith("$$") ||
          prev.endsWith("$$") ||
          prev.includes("$$")
        ) {
          joined.push(line);
          continue;
        }

        // Continuation of a bullet point: prev is a bullet that doesn't end with sentence punctuation,
        // and current line starts with lowercase (clearly continuation)
        const prevIsBullet = /^[-*•]\s/.test(prev) || /^\d+[.)]\s/.test(prev);
        if (prevIsBullet && !/[.!?;:]\s*$/.test(prev) && /^[a-zà-ÿ(,]/.test(trimmed)) {
          joined[prevIdx] = prev + " " + trimmed;
          continue;
        }

        // Regular paragraph continuation
        if (
          !prevIsBullet &&
          !prev.endsWith(":") &&
          !/[.!?;]\s*$/.test(prev) &&
          (/^[a-zà-ÿ(,]/.test(trimmed) ||
           (prev.length < 80 && trimmed.length > 10 && /^[A-ZÀ-Ÿa-zà-ÿ(]/.test(trimmed) && !trimmed.match(/^[A-ZÀ-Ÿ][a-zà-ÿ]+\s[A-ZÀ-Ÿ]/)))
        ) {
          joined[prevIdx] = prev + " " + trimmed;
          continue;
        }
      }

      joined.push(line);
    }
    cleaned = joined.join("\n");

    // 1j. Final pass: extract any remaining $$...$$ from composite lines
    // This catches formulas that survived merge or were inline in AI output
    cleaned = cleaned.split("\n").map((line: string) => {
      const trimmed = line.trim();
      // Skip lines that are already pure LaTeX
      if (trimmed.startsWith("$$") && trimmed.endsWith("$$")) return line;
      if (trimmed === "$$") return line;
      // Check for $$...$$ within the line
      const inlineMatch = trimmed.match(/^(.*?)(\$\$(?:[^$]|\$(?!\$))+\$\$)(.*)$/);
      if (inlineMatch) {
        const parts: string[] = [];
        if (inlineMatch[1].trim()) parts.push(inlineMatch[1].trimEnd());
        parts.push(inlineMatch[2]);
        if (inlineMatch[3].trim()) parts.push(inlineMatch[3].trimStart());
        return parts.join("\n");
      }
      return line;
    }).join("\n");

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

      // LaTeX formula blocks: $$...$$ (single line) or $$ on its own line (start multi-line)
      // MUST be checked BEFORE table detection (LaTeX may contain | pipe chars)
      const latexSingleMatch = line.match(/^\$\$(.*)\$\$$/);
      if (latexSingleMatch) {
        // End any open table
        if (inTable && tableRows.length > 0) {
          blocks.push({ type: "table", text: "", rows: [...tableRows] });
          tableRows = [];
          inTable = false;
        }
        blocks.push({ type: "latex", text: latexSingleMatch[1].trim() });
        continue;
      }
      // Multi-line LaTeX: standalone $$ or $$ with content (start of block)
      if (line === "$$" || line === "$ $" || (line.startsWith("$$") && !line.endsWith("$$"))) {
        // End any open table
        if (inTable && tableRows.length > 0) {
          blocks.push({ type: "table", text: "", rows: [...tableRows] });
          tableRows = [];
          inTable = false;
        }

        const hasInlineContent = line.startsWith("$$") && line.length > 2;
        const inlineFormula = hasInlineContent ? line.slice(2).trim() : "";

        // Look for closing $$ within next 5 lines max (prevent eating entire document)
        let latexContent = inlineFormula;
        let j = i + 1;
        let foundClose = false;
        const maxLookAhead = 5;
        while (j < lines.length && j <= i + maxLookAhead) {
          const jLine = lines[j].trim();
          if (jLine === "$$") {
            foundClose = true;
            break; // standalone closing $$
          }
          if (jLine.endsWith("$$")) {
            latexContent += (latexContent ? " " : "") + jLine.slice(0, -2).trim();
            foundClose = true;
            break; // closing $$ at end of line
          }
          latexContent += (latexContent ? " " : "") + jLine;
          j++;
        }

        if (foundClose && latexContent.trim()) {
          // Multi-line block with proper closing
          blocks.push({ type: "latex", text: latexContent.trim() });
          i = j;
          continue;
        } else if (inlineFormula) {
          // No closing $$ found — treat as single-line formula (AI forgot closing $$)
          blocks.push({ type: "latex", text: inlineFormula });
          continue;
        }
        // Standalone $$ with no closing — skip it (orphan delimiter)
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

      // [IMMAGINE: description] or [Vedi figura: description] tags
      const imageMatch = line.match(/\[(?:IMMAGINE|Vedi figura):\s*(.*?)\]/i);
      if (imageMatch) {
        const fullDesc = imageMatch[1];
        // Clean prompt-style language into educational caption
        let caption = fullDesc
          .replace(/^Un[a']?\s*(?:immagine|diagramma|schema|illustrazione|figura|grafico)\s*(?:che\s*(?:mostra|illustra|rappresenta|descrive))\s*/i, "")
          .replace(/\.\s*(?:L['']immagine|Il diagramma|Lo schema|La figura|Il grafico)\s*dovrebbe\s*(?:mostrare|includere|illustrare|rappresentare)[^.]*\.?/gi, "")
          .replace(/\.\s*Dovrebbe(?:ro)?\s*essere\s*(?:indicate|mostrate|evidenziate|visibili)[^.]*\.?/gi, "")
          .trim();
        // Capitalize first letter
        if (caption) caption = caption.charAt(0).toUpperCase() + caption.slice(1);
        // Truncate if too long
        if (caption.length > 200) {
          caption = caption.substring(0, 200).replace(/\s\S*$/, "") + "...";
        }
        blocks.push({ type: "image", text: caption || fullDesc });
        continue;
      }

      // Detect prompt-style image descriptions as standalone paragraphs
      // (these appear when [IMMAGINE:] tags were cleaned to parenthetical text by AI)
      const promptImageMatch = line.match(/^Un[a']?\s*(?:immagine|diagramma|schema|illustrazione|figura|grafico)\s*(?:che\s*(?:mostra|illustra|rappresenta|descrive))\s*(.*)/i);
      if (promptImageMatch) {
        let caption = promptImageMatch[1]
          .replace(/\.\s*(?:L['']immagine|Il diagramma|Lo schema)\s*dovrebbe\s*[^.]*\.?/gi, "")
          .replace(/\.\s*Dovrebbe(?:ro)?\s*essere\s*[^.]*\.?/gi, "")
          .trim();
        if (caption) caption = caption.charAt(0).toUpperCase() + caption.slice(1);
        if (caption.length > 200) {
          caption = caption.substring(0, 200).replace(/\s\S*$/, "") + "...";
        }
        blocks.push({ type: "image", text: caption || line });
        continue;
      }

      // Skip lines that are just "[IMMAGINE:" or "[Vedi figura:" without closing bracket
      if (line.match(/^\[(?:IMMAGINE|Vedi figura):/i)) {
        continue;
      }

      // Markdown headings (with or without space after #)
      // Strip any leading invisible chars for matching (unicode zero-width, BOM, NBSP)
      const headingLine = line.replace(/^[\u200B\uFEFF\u00A0]+/, "");

      // Fix CamelCase glued words: only when heading has NO spaces (clearly AI-glued)
      const fixHeadingText = (t: string): string => {
        // Check if heading is clearly glued (few/no spaces relative to length)
        const spaceCount = (t.match(/ /g) || []).length;
        const isGlued = t.length > 15 && spaceCount < t.length / 15;
        if (isGlued) {
          // Split before ASCII uppercase letters preceded by lowercase
          // Uses [A-Z] only (not accented) to avoid false positives like "Proprietà" → "Propriet à"
          t = t.replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2");
        }
        // Fix colon without space
        t = t.replace(/:([A-Za-zÀ-ÿ])/g, ": $1");
        return t.trim();
      };
      if (headingLine.match(/^#{4,}\s*/)) {
        // #### or more → treat as h3
        blocks.push({ type: "h3", text: fixHeadingText(headingLine.replace(/^#+\s*/, "")) });
      } else if (headingLine.match(/^###\s*/)) {
        blocks.push({ type: "h3", text: fixHeadingText(headingLine.replace(/^###\s*/, "")) });
      } else if (headingLine.match(/^##\s*/)) {
        blocks.push({ type: "h2", text: fixHeadingText(headingLine.replace(/^##\s*/, "")) });
      } else if (headingLine.match(/^#\s*/)) {
        blocks.push({ type: "h1", text: fixHeadingText(headingLine.replace(/^#\s*/, "")) });
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

    // ═══ Step 3: Post-processing on blocks ═══

    // 3a. Remove duplicate consecutive headings (same or very similar text)
    const filtered: PdfBlock[] = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const isHeading = block.type === "h1" || block.type === "h2" || block.type === "h3";
      if (isHeading && filtered.length > 0) {
        // Look back for the previous non-empty block
        let prevIdx = filtered.length - 1;
        while (prevIdx >= 0 && filtered[prevIdx].type === "empty") prevIdx--;
        if (prevIdx >= 0) {
          const prev = filtered[prevIdx];
          const prevIsHeading = prev.type === "h1" || prev.type === "h2" || prev.type === "h3";
          if (prevIsHeading) {
            const normalize = (s: string) => s.toLowerCase().replace(/[^a-zà-ÿ0-9]/g, "");
            if (normalize(prev.text) === normalize(block.text)) {
              continue; // Skip duplicate
            }
          }
        }
      }

      // 3b. Remove orphan fragments (1-3 chars, not a heading or list marker)
      if (block.type === "paragraph" && block.text.length <= 3 && !/^\d+[.)]/.test(block.text)) {
        continue; // Skip orphan like "I:" or "H"
      }

      // 3c. Demote single-word "headings" that are clearly not headings
      // (e.g. "zucchero" detected as h2 by short-line heuristic)
      if (isHeading && block.text.split(/\s+/).length === 1 && block.text.length < 15) {
        // Single word heading — check if it looks like a real heading (all caps or known)
        if (block.text !== block.text.toUpperCase()) {
          block.type = "paragraph"; // Demote to paragraph
        }
      }

      // 3d. Collapse excessive consecutive empty blocks (max 2)
      if (block.type === "empty") {
        let emptyCount = 0;
        for (let j = filtered.length - 1; j >= 0 && filtered[j].type === "empty"; j--) {
          emptyCount++;
        }
        if (emptyCount >= 2) continue; // Skip — already have 2 empty lines
      }

      // 3e. Remove raw text that looks like image labels without context
      // e.g. "NUCLEOSIDE NUCLEOTIDE base azotata gruppi fosfato"
      // These are figure labels extracted from images, not useful as text
      if (block.type === "paragraph" && /^[A-Z]{3,}(\s+[A-Za-zà-ÿ]+){2,}$/.test(block.text) && block.text.length < 80) {
        // Check if it's ALL-CAPS words mixed with lowercase — likely image label
        const words = block.text.split(/\s+/);
        const capsWords = words.filter(w => w === w.toUpperCase() && w.length > 2).length;
        if (capsWords >= 2 && capsWords < words.length) {
          continue; // Skip image label text
        }
      }

      filtered.push(block);
    }

    return filtered;
  };


  const handleDownloadPdf = async (text: string, title: string, chapterId?: string, withImages: boolean = true) => {
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

      // ── Load DejaVu Sans Unicode font (full Greek, math, arrows, subscripts) ──
      let unicodeFontLoaded = false;
      try {
        const fontRes = await fetch("/fonts/DejaVuSans.ttf");
        if (!fontRes.ok) throw new Error("DejaVuSans.ttf not found");
        const fontBuf = await fontRes.arrayBuffer();
        const fontBase64 = btoa(
          new Uint8Array(fontBuf).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        doc.addFileToVFS("DejaVuSans.ttf", fontBase64);
        doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");
        doc.addFont("DejaVuSans.ttf", "DejaVuSans", "bold");
        doc.addFont("DejaVuSans.ttf", "DejaVuSans", "italic");
        doc.setFont("DejaVuSans", "normal");
        unicodeFontLoaded = true;
      } catch (fontErr) {
        console.warn("[PDF] Failed to load Unicode font, falling back to Helvetica:", fontErr);
        doc.setFont("helvetica", "normal");
      }

      // Font helper: use DejaVuSans if available, else Helvetica
      const pdfFont = unicodeFontLoaded ? "DejaVuSans" : "helvetica";

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 20;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      const blocks = parseMarkdownBlocks(freshText);

      // Image generation logic (skip if withImages is false):
      // Dynamic limits based on text length:
      // - Short text (<3000 chars, single chapter): max 3 images
      // - Medium text (3000-8000 chars): max 5 images
      // - Long text (8000-20000 chars): max 7 images
      // - Very long text (>20000 chars, full summary): max 10 images
      const textLen = freshText.length;
      const MIN_IMAGES = textLen > 8000 ? 5 : textLen > 3000 ? 3 : 2;
      const MAX_IMAGES = textLen > 20000 ? 10 : textLen > 8000 ? 7 : textLen > 3000 ? 5 : 3;
      console.log(`[PDF] Text length: ${textLen}, image limits: min=${MIN_IMAGES}, max=${MAX_IMAGES}`);
      const imageMap: Record<string, string> = {};
      const anchorImageMap: Record<string, { base64: string; description: string }> = {};

      // Helper to generate a single image
      const genImage = async (description: string): Promise<string | null> => {
        try {
          const res = await fetch("/api/images/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.image) return data.image;
          }
        } catch { /* skip */ }
        return null;
      };

      // Pre-generated images for full book PDF (from summary_images table)
      const preGenImages: Array<{ base64: string; title: string; description: string }> = [];
      const isFullBookPdf = !chapterId && summaryImages.length > 0;

      if (withImages && isFullBookPdf) {
        // Use pre-generated images — download them as base64
        setPdfProgress(`Caricamento ${summaryImages.length} immagini pre-generate...`);
        for (let i = 0; i < summaryImages.length; i++) {
          try {
            const imgRes = await fetch(summaryImages[i].image_url);
            if (imgRes.ok) {
              const blob = await imgRes.blob();
              const buffer = await blob.arrayBuffer();
              const base64 = btoa(
                new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
              );
              preGenImages.push({
                base64,
                title: (summaryImages[i].title || "").replace(/\*/g, ""),
                description: summaryImages[i].description,
              });
            }
          } catch (err) {
            console.warn(`Failed to fetch pre-generated image ${i}:`, err);
          }
        }
        console.log(`[PDF] Loaded ${preGenImages.length} pre-generated images`);
      }

      if (withImages && !isFullBookPdf) {
        try {
          // Phase 1: Generate image tags — distributed evenly across sections
          const allImageBlocks = blocks.filter((b) => b.type === "image");

          // Group images by section (between h1/h2 headings)
          const sections: { heading: string; images: PdfBlock[] }[] = [];
          let currentSection: { heading: string; images: PdfBlock[] } = { heading: "intro", images: [] };
          for (const block of blocks) {
            if (block.type === "h1" || block.type === "h2") {
              if (currentSection.images.length > 0) sections.push(currentSection);
              currentSection = { heading: block.text, images: [] };
            } else if (block.type === "image") {
              currentSection.images.push(block);
            }
          }
          if (currentSection.images.length > 0) sections.push(currentSection);

          // Distribute MAX_IMAGES budget across sections proportionally
          let existingImageBlocks: PdfBlock[] = [];
          if (sections.length > 0 && allImageBlocks.length > MAX_IMAGES) {
            const totalTags = sections.reduce((sum, s) => sum + s.images.length, 0);
            let budget = MAX_IMAGES;
            for (const section of sections) {
              // Each section gets at least 1, proportional to its share of tags
              const share = Math.max(1, Math.round((section.images.length / totalTags) * MAX_IMAGES));
              const allowed = Math.min(share, budget, section.images.length);
              // Pick evenly spaced images from the section
              const step = section.images.length / allowed;
              for (let i = 0; i < allowed && budget > 0; i++) {
                existingImageBlocks.push(section.images[Math.floor(i * step)]);
                budget--;
              }
            }
            console.log(`[PDF] Distributed ${existingImageBlocks.length} images across ${sections.length} sections`);
          } else {
            existingImageBlocks = allImageBlocks.slice(0, MAX_IMAGES);
          }
          let generated = 0;

          if (existingImageBlocks.length > 0) {
            const total = existingImageBlocks.length;
            setPdfProgress(`Generazione ${total} immagini dai tag...`);
            console.log(`[PDF] Found ${allImageBlocks.length} image tags, generating ${total} (max ${MAX_IMAGES})`);

            // Generate in batches of 3 to avoid overwhelming the API
            for (let batch = 0; batch < total; batch += 3) {
              const batchBlocks = existingImageBlocks.slice(batch, batch + 3);
              const batchPromises = batchBlocks.map(async (block, i) => {
                setPdfProgress(`Generazione immagine ${batch + i + 1} di ${total}...`);
                const base64 = await genImage(block.text);
                if (base64) {
                  imageMap[block.text] = base64;
                  return true;
                }
                return false;
              });
              const batchResults = await Promise.all(batchPromises);
              generated += batchResults.filter(Boolean).length;
            }
            console.log(`[PDF] Generated ${generated}/${total} images from tags`);
          }

          // Phase 2: If we have fewer than MIN_IMAGES, ask AI for extras
          if (generated < MIN_IMAGES) {
            const remaining = MIN_IMAGES - generated;
            setPdfProgress("Analisi contenuto per immagini extra...");
            const analyzeRes = await fetch("/api/images/analyze", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text: freshText }),
            });

            if (analyzeRes.ok) {
              const { suggestions } = await analyzeRes.json();
              if (suggestions && suggestions.length > 0) {
                const extraSuggestions = suggestions.slice(0, remaining);
                console.log(`[PDF] AI suggests ${extraSuggestions.length} extra images (need ${remaining} more)`);

                const extraPromises = extraSuggestions.map(
                  async (s: { anchor: string; description: string }, i: number) => {
                    setPdfProgress(`Immagine extra ${i + 1} di ${extraSuggestions.length}...`);
                    const base64 = await genImage(s.description);
                    if (base64) {
                      anchorImageMap[s.anchor] = { base64, description: s.description };
                    }
                  }
                );
                await Promise.all(extraPromises);
                console.log(`[PDF] Generated ${Object.keys(anchorImageMap).length} extra images`);
              }
            }
          }
        } catch (err) {
          console.warn("[PDF] Image generation failed:", err);
        }
      } else if (!withImages) {
        console.log("[PDF] Skipping image generation (user opted out)");
      }

      setPdfProgress("Creazione PDF...");

      // Helper: sanitize Unicode chars that Helvetica can't render
      // jsPDF's Helvetica only supports Latin-1 (ISO 8859-1)
      // Characters above U+00FF get corrupted: α(U+03B1)→±(U+00B1), β(U+03B2)→²(U+00B2)
      const sanitizeForPdf = (text: string): string => {
        let result = text
          // Strip HTML tags: <sub>x</sub> → x, <sup>2</sup> → ², <br> → space
          .replace(/<br\s*\/?>/gi, " ")
          .replace(/<sup>(.*?)<\/sup>/gi, (_m, c) => {
            const supMap: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "n": "ⁿ" };
            return c.split("").map((ch: string) => supMap[ch] || ch).join("");
          })
          .replace(/<sub>(.*?)<\/sub>/gi, (_m, c) => {
            const subMap: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "n": "ₙ", "m": "ₘ", "x": "ₓ" };
            return c.split("").map((ch: string) => subMap[ch] || ch).join("");
          })
          .replace(/<[^>]+>/g, "") // Strip any remaining HTML tags
          // Strip markdown bold/italic markers (**bold**, *italic*, ***both***)
          .replace(/\*{1,3}(.+?)\*{1,3}/g, "$1")
          // Strip escaped underscores from markdown (\_n → _n)
          .replace(/\\_/g, "_")
          // ── Fix Italian text quality issues (AI generation artifacts) ──
          // Fix apostrophe used instead of accent (e' → è, piu' → più, etc.)
          .replace(/\be'(?=\s|$|[,.])/gi, "è")
          .replace(/\bpiu'(?=\s|$|[,.])/gi, "più")
          .replace(/\bcioe'(?=\s|$|[,.])/gi, "cioè")
          .replace(/\bperche'(?=\s|$|[,.])/gi, "perché")
          .replace(/\bpoiche'(?=\s|$|[,.])/gi, "poiché")
          .replace(/\bfinche'(?=\s|$|[,.])/gi, "finché")
          .replace(/\bne'(?=\s|$|[,.])/gi, "né")
          .replace(/\bnonche'(?=\s|$|[,.])/gi, "nonché")
          // Fix words glued to "è" (nonè → non è, ondaè → onda è, edè → ed è)
          // Matches any 2+ letter word + è, except Italian words that end in è (caffè, cioè, etc.)
          .replace(/(\w{2,})è(?=\s|[,.:;!?)]|$)/g, (match: string, word: string) => {
            const exceptions = ["caff", "cio", "ahim", "beb", "pur", "gil", "merc", "canap", "pi"];
            if (exceptions.includes(word.toLowerCase())) return match;
            return word + " è";
          })
          // Single-char word + è (skip "tè" which is valid Italian)
          .replace(/\b([A-Za-z])è(?=\s|[,.]|$)/g, (match: string, char: string) => {
            if (char.toLowerCase() === "t") return match;
            return char + " è";
          })
          // Fix "e'piu'" pattern (e'piu'quantizzata → è più quantizzata)
          .replace(/\be'piu'/gi, "è più ");

        if (unicodeFontLoaded) {
          // ── DejaVu Sans: Greek, math, arrows, superscripts, subscripts all render natively ──
          // Only convert chars NOT in DejaVu Sans

          result = result
            // ── Double arrows → ASCII (not in DejaVu) ──
            .replace(/⇒/g, " => ").replace(/⇐/g, " <= ").replace(/⇔/g, " <=> ")
            // ── Set notation (rarely in font) ──
            .replace(/ℝ/g, "R").replace(/ℤ/g, "Z").replace(/ℕ/g, "N").replace(/ℂ/g, "C")
            // ── Special dashes and punctuation ──
            .replace(/—/g, " - ").replace(/–/g, "-")
            .replace(/…/g, "...").replace(/•/g, "-")
            .replace(/[""]/g, '"').replace(/['']/g, "'")
            .replace(/\u00A0/g, " ");

        } else {
          // ── Helvetica fallback: replace ALL non-Latin-1 characters ──
          result = result
            // Greek lowercase
            .replace(/α/g, "alfa").replace(/β/g, "beta").replace(/γ/g, "gamma").replace(/δ/g, "delta")
            .replace(/ε/g, "epsilon").replace(/ζ/g, "zeta").replace(/η/g, "eta").replace(/θ/g, "theta")
            .replace(/ι/g, "iota").replace(/κ/g, "kappa").replace(/λ/g, "lambda").replace(/μ/g, "mu")
            .replace(/ν/g, "nu").replace(/ξ/g, "xi").replace(/ο/g, "o").replace(/π/g, "pi")
            .replace(/ρ/g, "rho").replace(/ς/g, "sigma").replace(/σ/g, "sigma").replace(/τ/g, "tau")
            .replace(/υ/g, "upsilon").replace(/φ/g, "phi").replace(/χ/g, "chi")
            .replace(/ψ/g, "psi").replace(/ω/g, "omega")
            // Greek uppercase
            .replace(/Α/g, "A").replace(/Β/g, "B").replace(/Γ/g, "Gamma").replace(/Δ/g, "Delta")
            .replace(/Ε/g, "E").replace(/Ζ/g, "Z").replace(/Η/g, "H").replace(/Θ/g, "Theta")
            .replace(/Ι/g, "I").replace(/Κ/g, "K").replace(/Λ/g, "Lambda").replace(/Μ/g, "M")
            .replace(/Ν/g, "N").replace(/Ξ/g, "Xi").replace(/Ο/g, "O").replace(/Π/g, "Pi")
            .replace(/Ρ/g, "Rho").replace(/Σ/g, "Sigma").replace(/Τ/g, "T").replace(/Υ/g, "Y")
            .replace(/Φ/g, "Phi").replace(/Χ/g, "Chi").replace(/Ψ/g, "Psi").replace(/Ω/g, "Omega")
            // Math symbols
            .replace(/ℏ/g, "h-bar").replace(/ħ/g, "h-bar")
            .replace(/∞/g, "infinito")
            .replace(/≤/g, "<=").replace(/≥/g, ">=")
            .replace(/≈/g, "~").replace(/≠/g, "!=")
            .replace(/≡/g, "=").replace(/≪/g, "<<").replace(/≫/g, ">>")
            .replace(/√/g, "sqrt").replace(/∂/g, "d")
            .replace(/∫/g, "integral").replace(/∑/g, "sum").replace(/∏/g, "product")
            .replace(/∇/g, "nabla").replace(/∝/g, " prop. ")
            .replace(/∈/g, " in ").replace(/∉/g, " not in ")
            .replace(/ℓ/g, "l").replace(/⋅/g, "·")
            .replace(/ℝ/g, "R").replace(/ℤ/g, "Z").replace(/ℕ/g, "N").replace(/ℂ/g, "C")
            // Subscript digits
            .replace(/₀/g, "0").replace(/₁/g, "1").replace(/₂/g, "2").replace(/₃/g, "3")
            .replace(/₄/g, "4").replace(/₅/g, "5").replace(/₆/g, "6").replace(/₇/g, "7")
            .replace(/₈/g, "8").replace(/₉/g, "9")
            // Subscript letters
            .replace(/ₐ/g, "a").replace(/ₑ/g, "e").replace(/ₒ/g, "o").replace(/ₓ/g, "x")
            .replace(/ₕ/g, "h").replace(/ₖ/g, "k").replace(/ₗ/g, "l").replace(/ₘ/g, "m")
            .replace(/ₙ/g, "n").replace(/ₚ/g, "p").replace(/ₛ/g, "s").replace(/ₜ/g, "t")
            // Superscript digits
            .replace(/⁰/g, "0").replace(/¹/g, "1").replace(/²/g, "2").replace(/³/g, "3")
            .replace(/⁴/g, "4").replace(/⁵/g, "5").replace(/⁶/g, "6").replace(/⁷/g, "7")
            .replace(/⁸/g, "8").replace(/⁹/g, "9")
            .replace(/ⁱ/g, "i").replace(/ⁿ/g, "n")
            .replace(/⁺/g, "+").replace(/⁻/g, "-")
            // Arrows
            .replace(/→/g, "->").replace(/←/g, "<-").replace(/↔/g, "<->")
            .replace(/⇒/g, "=>").replace(/⇐/g, "<=").replace(/⇔/g, "<=>")
            .replace(/↑/g, "^").replace(/↓/g, "v")
            // Special dashes and punctuation
            .replace(/—/g, "-").replace(/–/g, "-")
            .replace(/•/g, "-").replace(/…/g, "...")
            .replace(/[""]/g, '"').replace(/['']/g, "'")
            .replace(/\u00A0/g, " ")
            // Safety net: any remaining non-Latin-1 → ?
            .replace(/[^\u0000-\u00FF]/g, "?");
        }

        return result;
      };

      // Helper: check page break and add new page if needed
      const ensureSpace = (needed: number) => {
        if (y + needed > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
      };

      // ── Sanitize all block text for PDF font compatibility ──
      for (const block of blocks) {
        if (block.type === "latex") continue; // Keep LaTeX raw for KaTeX rendering
        block.text = sanitizeForPdf(block.text);
        if (block.rows) {
          block.rows = block.rows.map(row => row.map(cell => sanitizeForPdf(cell)));
        }
      }

      // ── Document Title ──
      doc.setFontSize(22);
      doc.setFont(pdfFont, "bold");
      const titleLines = doc.splitTextToSize(sanitizeForPdf(title), maxWidth);
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

      // Helper: insert AI-generated image if this block's text matches an anchor
      const usedAnchors = new Set<string>();
      const tryInsertAnchorImage = () => {
        // Check the last rendered block text against anchors
        for (const [anchor, imgData] of Object.entries(anchorImageMap)) {
          if (usedAnchors.has(anchor)) continue;
          // Check if any recent block text contains the anchor
          const lastBlocksText = blocks
            .slice(Math.max(0, currentBlockIdx - 1), currentBlockIdx + 1)
            .map((b) => b.text)
            .join(" ");
          if (lastBlocksText.includes(anchor) || anchor.split(" ").slice(0, 5).join(" ").length > 0 &&
              lastBlocksText.toLowerCase().includes(anchor.toLowerCase().split(" ").slice(0, 5).join(" "))) {
            usedAnchors.add(anchor);
            const imgWidth = maxWidth * 0.65;
            const imgHeight = imgWidth * 0.55;
            ensureSpace(imgHeight + 14);
            const imgX = margin + (maxWidth - imgWidth) / 2;
            try {
              doc.addImage(
                `data:image/png;base64,${imgData.base64}`,
                "PNG",
                imgX, y, imgWidth, imgHeight
              );
              y += imgHeight + 2;
              doc.setFontSize(8);
              doc.setFont(pdfFont, "italic");
              doc.setTextColor(120);
              const captionLines = doc.splitTextToSize(sanitizeForPdf(imgData.description), maxWidth * 0.8);
              for (const cl of captionLines.slice(0, 2)) {
                doc.text(cl, pageWidth / 2, y, { align: "center" });
                y += 4;
              }
              y += 4;
              doc.setTextColor(0);
            } catch {
              // Image embedding failed, skip
            }
          }
        }
      };

      // ── Pre-generated image insertion planning ──
      // Distribute pre-gen images evenly across h2 headings
      const h2Indices: number[] = [];
      blocks.forEach((b, i) => { if (b.type === "h2") h2Indices.push(i); });
      const preGenInsertAfter = new Map<number, typeof preGenImages[0]>();
      if (preGenImages.length > 0 && h2Indices.length > 0) {
        const step = Math.max(1, Math.floor(h2Indices.length / (preGenImages.length + 1)));
        for (let i = 0; i < preGenImages.length; i++) {
          const targetIdx = h2Indices[Math.min((i + 1) * step, h2Indices.length - 1)];
          preGenInsertAfter.set(targetIdx, preGenImages[i]);
        }
      }

      // Helper to render a pre-generated image
      const renderPreGenImage = (img: typeof preGenImages[0]) => {
        const imgWidth = maxWidth * 0.6;
        const imgHeight = imgWidth * 0.5;
        const captionSpace = 14; // space for caption lines
        ensureSpace(imgHeight + captionSpace);
        y += 3; // small gap before image
        const imgX = margin + (maxWidth - imgWidth) / 2;
        try {
          doc.addImage(
            `data:image/png;base64,${img.base64}`,
            "PNG",
            imgX, y, imgWidth, imgHeight
          );
          y += imgHeight + 2;
          // Caption: title (stripped of markdown)
          doc.setFontSize(7.5);
          doc.setFont(pdfFont, "italic");
          doc.setTextColor(100, 100, 100);
          const caption = sanitizeForPdf(img.title.replace(/\*/g, ""));
          const captionLines = doc.splitTextToSize(caption, maxWidth * 0.8);
          for (const cl of captionLines.slice(0, 2)) {
            doc.text(cl, pageWidth / 2, y, { align: "center" });
            y += 3.5;
          }
          y += 3;
          doc.setTextColor(0);
          doc.setFont(pdfFont, "normal");
        } catch {
          // Image embedding failed, skip
        }
      };

      // ── KaTeX formula rendering helper ──
      // Load KaTeX CSS once for all formulas
      let katexCssLoaded = !!document.querySelector('link[href*="katex"]');
      const ensureKatexCss = async () => {
        if (katexCssLoaded) return;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.38/dist/katex.min.css";
        document.head.appendChild(link);
        await new Promise<void>(resolve => {
          link.onload = () => resolve();
          setTimeout(resolve, 1500); // fallback timeout
        });
        katexCssLoaded = true;
      };

      // Clean up LaTeX string before passing to KaTeX
      const cleanLatex = (raw: string): string => {
        if (!raw || raw === "undefined") return "";
        let s = raw.trim();
        // Remove leading/trailing $$ if somehow still present
        if (s.startsWith("$$")) s = s.slice(2);
        if (s.endsWith("$$")) s = s.slice(0, -2);
        s = s.trim();
        // Fix common AI output issues:
        // \psi (x) → \psi(x), \frac {a}{b} → \frac{a}{b}
        s = s.replace(/\\(psi|phi|Psi|Phi|alpha|beta|gamma|delta|omega|theta|sigma|lambda|mu|epsilon|rho|tau|nu|xi|pi|hbar|sqrt|frac|sin|cos|tan|log|ln|exp|int|sum|prod|left|right|lim|inf|sup|max|min|det|ker|dim|deg|gcd|arg|bmod|pmod)\s+(\(|\{|\[)/g, "\\$1$2");
        // Fix double backslashes that aren't line breaks: \\frac → \frac
        s = s.replace(/\\\\(?=(frac|sqrt|psi|phi|int|sum|prod|left|right|sin|cos|tan|hbar|alpha|beta|gamma|delta))/g, "\\");
        return s;
      };

      const renderLatexToImage = async (latex: string): Promise<{ dataUrl: string; width: number; height: number } | null> => {
        try {
          const katex = (await import("katex")).default;
          const html2canvas = (await import("html2canvas")).default;
          await ensureKatexCss();

          const cleaned = cleanLatex(latex);

          // Render LaTeX to HTML
          const html = katex.renderToString(cleaned, {
            displayMode: true,
            throwOnError: false,
            output: "html",
          });

          // Create container (needs to be in DOM for html2canvas)
          const container = document.createElement("div");
          container.innerHTML = html;
          container.style.position = "fixed";
          container.style.left = "-9999px";
          container.style.top = "0";
          container.style.fontSize = "22px";
          container.style.color = "#000000";
          container.style.background = "#ffffff";
          container.style.padding = "10px 16px";
          container.style.display = "inline-block";
          // Force black color on ALL child elements (KaTeX uses nested spans)
          const style = document.createElement("style");
          style.textContent = `
            .katex-formula-capture, .katex-formula-capture * {
              color: #000000 !important;
              opacity: 1 !important;
              -webkit-text-fill-color: #000000 !important;
            }
          `;
          container.classList.add("katex-formula-capture");
          document.head.appendChild(style);
          document.body.appendChild(container);

          // Wait for CSS to apply
          await new Promise(resolve => setTimeout(resolve, 100));

          const canvas = await html2canvas(container, {
            scale: 3,
            backgroundColor: "#ffffff",
            logging: false,
            useCORS: true,
          });

          // Cleanup style tag
          document.head.removeChild(style);

          const dataUrl = canvas.toDataURL("image/png");
          const w = canvas.width;
          const h = canvas.height;

          document.body.removeChild(container);

          return { dataUrl, width: w, height: h };
        } catch (err) {
          console.warn("[PDF] KaTeX render failed for:", latex, err);
          return null;
        }
      };

      // ── Render blocks ──
      let currentBlockIdx = 0;
      for (const block of blocks) {
        switch (block.type) {
          case "h1": {
            ensureSpace(16);
            y += 6;
            doc.setFontSize(16);
            doc.setFont(pdfFont, "bold");
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
            doc.setFont(pdfFont, "bold");
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
            doc.setFont(pdfFont, "bold");
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
            doc.setFont(pdfFont, "normal");
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

          case "latex": {
            // Guard against undefined/empty latex
            if (!block.text || block.text === "undefined") break;

            // Helper: convert LaTeX to readable Unicode for fallback
            const latexToReadable = (tex: string): string => {
              let s = cleanLatex(tex);
              // Replace common LaTeX commands with Unicode
              s = s.replace(/\\hbar/g, "ℏ");
              s = s.replace(/\\psi/g, "ψ");
              s = s.replace(/\\Psi/g, "Ψ");
              s = s.replace(/\\phi/g, "φ");
              s = s.replace(/\\pi/g, "π");
              s = s.replace(/\\alpha/g, "α");
              s = s.replace(/\\beta/g, "β");
              s = s.replace(/\\gamma/g, "γ");
              s = s.replace(/\\delta/g, "δ");
              s = s.replace(/\\Delta/g, "Δ");
              s = s.replace(/\\omega/g, "ω");
              s = s.replace(/\\theta/g, "θ");
              s = s.replace(/\\sigma/g, "σ");
              s = s.replace(/\\lambda/g, "λ");
              s = s.replace(/\\mu/g, "μ");
              s = s.replace(/\\epsilon/g, "ε");
              s = s.replace(/\\infty/g, "∞");
              s = s.replace(/\\nabla/g, "∇");
              s = s.replace(/\\partial/g, "∂");
              s = s.replace(/\\int/g, "∫");
              s = s.replace(/\\sum/g, "∑");
              s = s.replace(/\\prod/g, "∏");
              s = s.replace(/\\sqrt\{([^}]+)\}/g, "√($1)");
              s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");
              s = s.replace(/\\left[|(]/g, "(");
              s = s.replace(/\\right[|)]/g, ")");
              s = s.replace(/\\left\\\{/g, "{");
              s = s.replace(/\\right\\\}/g, "}");
              s = s.replace(/\\cdot/g, "·");
              s = s.replace(/\\times/g, "×");
              s = s.replace(/\\leq/g, "≤");
              s = s.replace(/\\geq/g, "≥");
              s = s.replace(/\\neq/g, "≠");
              s = s.replace(/\\approx/g, "≈");
              s = s.replace(/\\pm/g, "±");
              s = s.replace(/\\sin/g, "sin");
              s = s.replace(/\\cos/g, "cos");
              s = s.replace(/\\tan/g, "tan");
              s = s.replace(/\\ln/g, "ln");
              s = s.replace(/\\log/g, "log");
              s = s.replace(/\\exp/g, "exp");
              s = s.replace(/\^2/g, "²");
              s = s.replace(/\^3/g, "³");
              s = s.replace(/\^n/g, "ⁿ");
              s = s.replace(/_0/g, "₀");
              s = s.replace(/_1/g, "₁");
              s = s.replace(/_n/g, "ₙ");
              // Remove remaining LaTeX commands
              s = s.replace(/\\[a-zA-Z]+/g, "");
              // Clean up braces and extra whitespace
              s = s.replace(/[{}]/g, "");
              s = s.replace(/\s+/g, " ").trim();
              return s;
            };

            try {
              const rendered = await renderLatexToImage(block.text);
              if (rendered) {
                // Scale image to fit PDF width (max 70% of page width), min height 4mm
                let imgWidthMm = Math.min(maxWidth * 0.7, rendered.width / 3 * 0.264583);
                let imgHeightMm = imgWidthMm * (rendered.height / rendered.width);
                // Ensure minimum readable height
                if (imgHeightMm < 4) {
                  imgHeightMm = 4;
                  imgWidthMm = imgHeightMm * (rendered.width / rendered.height);
                }
                ensureSpace(imgHeightMm + 6);
                y += 2;
                const imgX = margin + (maxWidth - imgWidthMm) / 2; // center
                doc.addImage(rendered.dataUrl, "PNG", imgX, y, imgWidthMm, imgHeightMm);
                y += imgHeightMm + 4;
              } else {
                // Fallback: render as readable Unicode text (not raw LaTeX)
                doc.setFontSize(11);
                doc.setFont(pdfFont, "normal");
                doc.setTextColor(30, 30, 30);
                const fallbackText = sanitizeForPdf(latexToReadable(block.text));
                const lines = doc.splitTextToSize(fallbackText, maxWidth - 20);
                ensureSpace(8);
                y += 2;
                for (const line of lines) {
                  ensureSpace(6);
                  doc.text(line, margin + 10, y); // slightly indented, centered
                  y += 5.5;
                }
                y += 2;
                doc.setTextColor(0);
              }
            } catch (err) {
              console.warn("[PDF] LaTeX block render failed:", err);
              // Fallback: readable Unicode
              doc.setFontSize(11);
              doc.setFont(pdfFont, "normal");
              doc.setTextColor(30, 30, 30);
              const fallbackText = sanitizeForPdf(latexToReadable(block.text));
              const lines = doc.splitTextToSize(fallbackText, maxWidth - 20);
              for (const line of lines) {
                ensureSpace(6);
                doc.text(line, margin + 10, y);
                y += 5.5;
              }
              y += 2;
              doc.setTextColor(0);
            }
            break;
          }

          case "table": {
            if (block.rows && block.rows.length > 0) {
              const tableRowH = 7;
              const totalTableHeight = block.rows.length * tableRowH + 7;
              const spaceLeft = pageHeight - margin - y;
              if (totalTableHeight < pageHeight - margin * 2 && totalTableHeight > spaceLeft) {
                doc.addPage();
                y = margin;
              }
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
                    doc.setFont(pdfFont, "bold");
                  } else {
                    if (rowIdx % 2 === 0) {
                      doc.setFillColor(248, 248, 252);
                      doc.rect(cellX, y - 5, cellWidth, rowHeight, "F");
                    }
                    doc.setFont(pdfFont, "normal");
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
                // Brief caption under image (word-wrapped)
                doc.setFontSize(8);
                doc.setFont(pdfFont, "italic");
                doc.setTextColor(120);
                const captionMaxWidth = maxWidth * 0.85;
                const captionLines = doc.splitTextToSize(block.text, captionMaxWidth);
                for (const capLine of captionLines) {
                  doc.text(capLine, pageWidth / 2, y, { align: "center" });
                  y += 3.5;
                }
                y += 2;
                doc.setTextColor(0);
              } catch {
                // Skip if embedding fails
                y += 2;
              }
            }
            // If no image was generated, skip silently (no ugly tag in PDF)
            break;
          }

          case "paragraph": {
            // Safety net: if paragraph still contains $$...$$, extract and render as LaTeX
            const paraInlineLatex = block.text.match(/\$\$((?:[^$]|\$(?!\$))+)\$\$/);
            if (paraInlineLatex) {
              // Split into text-before, formula, text-after
              const idx = block.text.indexOf(paraInlineLatex[0]);
              const before = block.text.slice(0, idx).trim();
              const formula = paraInlineLatex[1];
              const after = block.text.slice(idx + paraInlineLatex[0].length).trim();

              // Render text before
              if (before) {
                doc.setFontSize(10.5);
                doc.setFont(pdfFont, "normal");
                doc.setTextColor(30, 30, 30);
                const beforeClean = before.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
                const bLines = doc.splitTextToSize(beforeClean, maxWidth);
                for (const bl of bLines) { ensureSpace(6); doc.text(bl, margin, y); y += 5.5; }
              }
              // Render formula
              try {
                const rendered = await renderLatexToImage(formula);
                if (rendered) {
                  let imgW = Math.min(maxWidth * 0.7, rendered.width / 3 * 0.264583);
                  let imgH = imgW * (rendered.height / rendered.width);
                  if (imgH < 4) { imgH = 4; imgW = imgH * (rendered.width / rendered.height); }
                  ensureSpace(imgH + 6);
                  y += 2;
                  doc.addImage(rendered.dataUrl, "PNG", margin + (maxWidth - imgW) / 2, y, imgW, imgH);
                  y += imgH + 4;
                }
              } catch { /* skip */ }
              // Render text after
              if (after) {
                doc.setFontSize(10.5);
                doc.setFont(pdfFont, "normal");
                doc.setTextColor(30, 30, 30);
                const afterClean = after.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
                const aLines = doc.splitTextToSize(afterClean, maxWidth);
                for (const al of aLines) { ensureSpace(6); doc.text(al, margin, y); y += 5.5; }
              }
              y += 3;
              doc.setTextColor(0);
              break;
            }

            doc.setFontSize(10.5);
            doc.setFont(pdfFont, "normal");
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

        // After rendering each block, check if an AI-selected image should be inserted here
        tryInsertAnchorImage();

        // Insert pre-generated image if this block is a distribution point
        const preGenImg = preGenInsertAfter.get(currentBlockIdx);
        if (preGenImg) {
          renderPreGenImage(preGenImg);
        }

        currentBlockIdx++;
      }

      // ── Remove near-empty last page ──
      const lastPageNum = doc.getNumberOfPages();
      if (lastPageNum > 1) {
        // If the last page has very little content (y is near top), remove it
        // y tracks the current position on the last page; if < margin + 60, page is nearly empty
        if (y < margin + 60) {
          doc.deletePage(lastPageNum);
        }
      }

      // ── Footer on each page ──
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setFont(pdfFont, "normal");
        doc.setTextColor(150);
        doc.text(
          `Generato da Backup Buddy v3 - Pagina ${i}/${totalPages}`,
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
      // Update the chapter summaries map so the full book view uses this summary
      if (generateChapterId) {
        setChapterSummaries(prev => ({ ...prev, [generateChapterId]: data.summary }));
      }
    } catch (err) {
      console.error("Error generating summary:", err);
    } finally {
      setGenerating(false);
    }
  };

  const generateAllMissingSummaries = async () => {
    if (!user || bulkGenerating) return;
    const missing = chapters.filter(c => c.processing_status === "completed" && !chapterSummaries[c.id]);
    if (missing.length === 0) return;

    setBulkGenerating(true);
    setBulkProgress({ current: 0, total: missing.length, chapterName: "" });

    for (let i = 0; i < missing.length; i++) {
      const ch = missing[i];
      setBulkProgress({ current: i + 1, total: missing.length, chapterName: ch.title });
      try {
        const response = await fetch("/api/summaries/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterId: ch.id,
            userId: user.id,
            length: "medium",
            maxWords: 500,
            language: "it",
          }),
        });
        const data = await response.json();
        if (response.ok && data.summary) {
          setChapterSummaries(prev => ({ ...prev, [ch.id]: data.summary }));
        }
      } catch (err) {
        console.error(`Summary generation failed for ${ch.title}:`, err);
      }
    }

    setBulkGenerating(false);
    setBulkProgress({ current: 0, total: 0, chapterName: "" });

    // Auto-generate images after all summaries are ready
    await generateSummaryImages();
  };

  const regenerateAllSummaries = async () => {
    if (!user || bulkGenerating) return;
    const allChapters = chapters.filter(c => c.processing_status === "completed");
    if (allChapters.length === 0) return;

    if (!confirm(`Rigenerare i riassunti di tutti i ${allChapters.length} capitoli? I riassunti attuali verranno sovrascritti.`)) return;

    setBulkGenerating(true);
    setBulkProgress({ current: 0, total: allChapters.length, chapterName: "" });

    for (let i = 0; i < allChapters.length; i++) {
      const ch = allChapters[i];
      setBulkProgress({ current: i + 1, total: allChapters.length, chapterName: ch.title });
      try {
        const response = await fetch("/api/summaries/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterId: ch.id,
            userId: user.id,
            length: "medium",
            maxWords: 500,
            language: "it",
          }),
        });
        const data = await response.json();
        if (response.ok && data.summary) {
          setChapterSummaries(prev => ({ ...prev, [ch.id]: data.summary }));
        }
      } catch (err) {
        console.error(`Summary regeneration failed for ${ch.title}:`, err);
      }
    }

    setBulkGenerating(false);
    setBulkProgress({ current: 0, total: 0, chapterName: "" });
  };

  const generateSummaryImages = async () => {
    if (!user || imageGenerating) return;

    const completed = chapters.filter(c => c.processing_status === "completed");
    const allHaveSummaries = completed.every(c => chapterSummaries[c.id]);
    if (!allHaveSummaries || completed.length === 0) return;

    setImageGenerating(true);
    setImageProgress({ step: "Assemblaggio testo completo...", current: 0, total: 5 });

    try {
      // Step 1: Assemble full text from chapter summaries
      const fullText = completed
        .map(c => chapterSummaries[c.id] || "")
        .filter(Boolean)
        .join("\n\n---\n\n");

      if (fullText.length < 100) {
        setImageProgress({ step: "Testo troppo corto per generare immagini", current: 0, total: 0 });
        return;
      }

      // Step 2: Analyze text to find 5 topics
      setImageProgress({ step: "Analisi AI per identificare argomenti chiave...", current: 0, total: 5 });

      const analyzeRes = await fetch("/api/images/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: fullText }),
      });

      if (!analyzeRes.ok) throw new Error("Analisi fallita");

      const { suggestions } = await analyzeRes.json();
      if (!suggestions || suggestions.length === 0) {
        setImageProgress({ step: "Nessun argomento adatto trovato", current: 0, total: 0 });
        return;
      }

      const totalImages = suggestions.length; // typically 5

      // Step 3: Delete old images if any
      if (summaryImages.length > 0) {
        await fetch("/api/images/generate-for-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId, userId: user.id, cleanupOnly: true }),
        });
      }

      // Step 4: Generate each image one by one
      const generated: Array<{
        title: string;
        description: string;
        anchor: string;
        base64: string;
        positionIndex: number;
      }> = [];

      for (let i = 0; i < suggestions.length; i++) {
        const s = suggestions[i];
        const title = (s.anchor?.split(" ").slice(0, 5).join(" ") || `Immagine ${i + 1}`).replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1");
        setImageProgress({
          step: `Generazione immagine ${i + 1}/${totalImages}: ${title}...`,
          current: i,
          total: totalImages,
        });

        try {
          const imgRes = await fetch("/api/images/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ description: s.description }),
          });

          if (imgRes.ok) {
            const imgData = await imgRes.json();
            if (imgData.image) {
              generated.push({
                title: title,
                description: s.description,
                anchor: s.anchor || "",
                base64: imgData.image,
                positionIndex: i,
              });
            }
          }
        } catch (err) {
          console.warn(`Image ${i + 1} generation failed:`, err);
        }
      }

      // Step 5: Save all to Supabase via API
      setImageProgress({
        step: `Salvataggio ${generated.length} immagini...`,
        current: totalImages,
        total: totalImages,
      });

      const saveRes = await fetch("/api/images/generate-for-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId,
          userId: user.id,
          saveImages: generated.map(g => ({
            title: g.title,
            description: g.description,
            anchor_text: g.anchor.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1"),
            base64: g.base64,
            position_index: g.positionIndex,
          })),
        }),
      });

      if (saveRes.ok) {
        const saveData = await saveRes.json();
        if (saveData.images) setSummaryImages(saveData.images);
      }

      setImageProgress({
        step: `${generated.length} immagini generate con successo!`,
        current: totalImages,
        total: totalImages,
      });
    } catch (err) {
      console.error("Image generation error:", err);
      setImageProgress({ step: "Errore generazione immagini", current: 0, total: 0 });
    } finally {
      setTimeout(() => {
        setImageGenerating(false);
        setImageProgress({ step: "", current: 0, total: 0 });
      }, 2000);
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
                onClick={() => requestPdfDownload(
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

                {/* Image Toggle */}
                <div className="mb-6">
                  <button
                    onClick={() => setIncludeImages(!includeImages)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                      includeImages
                        ? "border-blue-500 bg-blue-500/20"
                        : "border-slate-600 bg-slate-700/50 hover:border-slate-500"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{includeImages ? "🖼️" : "📝"}</span>
                      <div className="text-left">
                        <div className="text-white text-sm font-medium">
                          {includeImages ? "Con immagini AI" : "Solo testo"}
                        </div>
                        <div className="text-slate-400 text-xs">
                          {includeImages ? "Genera immagini educative nel PDF" : "PDF più veloce, senza costi extra"}
                        </div>
                      </div>
                    </div>
                    <div className={`w-12 h-7 rounded-full transition-colors relative ${includeImages ? "bg-blue-500" : "bg-slate-600"}`}>
                      <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${includeImages ? "right-1" : "left-1"}`} />
                    </div>
                  </button>
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
                      handleDownloadPdf(generatedSummary, `Riassunto - ${chapter?.title || "Documento"}`, undefined, includeImages);
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

      {/* Segmented Control */}
      {completedChapters.length > 1 && (
        <div className="mb-6">
          <div className="inline-flex bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-1">
            <button
              onClick={() => setSummaryView("full")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                summaryView === "full"
                  ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Libro Intero
            </button>
            <button
              onClick={() => setSummaryView("chapters")}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                summaryView === "chapters"
                  ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              Per Capitoli
            </button>
          </div>
        </div>
      )}

      {/* Content */}
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
      ) : summaryView === "full" ? (
        /* ── FULL BOOK VIEW ── */
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center">
                <span className="text-3xl">📚</span>
              </div>
              <div>
                <h3 className="text-white font-semibold text-xl">{source?.title}</h3>
                <p className="text-slate-400 text-sm mt-1">
                  {completedChapters.length} capitoli &middot; Contenuto completo
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(() => {
                const chaptersWithSummary = completedChapters.filter(c => chapterSummaries[c.id]);
                const chaptersWithoutSummary = completedChapters.filter(c => !chapterSummaries[c.id]);
                const allHaveSummaries = chaptersWithoutSummary.length === 0;

                return (
                  <>
                    <button
                      onClick={() => {
                        const fullText = completedChapters
                          .map(c => chapterSummaries[c.id] || c.processed_text || "")
                          .join("\n\n---\n\n");
                        const fakeChapter = { ...completedChapters[0], title: source?.title || "Libro", processed_text: fullText };
                        openReadMode(fakeChapter as Chapter);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors text-sm font-medium"
                    >
                      <span>📖</span>
                      Leggi Tutto
                    </button>
                    <button
                      onClick={() => {
                        if (!allHaveSummaries) {
                          alert(`Genera prima i riassunti per tutti i capitoli.\nMancano: ${chaptersWithoutSummary.map(c => c.title).join(", ")}`);
                          return;
                        }
                        const fullText = completedChapters
                          .map(c => chapterSummaries[c.id])
                          .join("\n\n---\n\n");
                        requestPdfDownload(fullText, source?.title || "Libro Completo");
                      }}
                      disabled={pdfGenerating}
                      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      {allHaveSummaries ? "Scarica PDF Riassunto" : `Scarica PDF (${chaptersWithSummary.length}/${completedChapters.length} riassunti)`}
                    </button>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Summary status info */}
          {(() => {
            const readyCount = completedChapters.filter(c => chapterSummaries[c.id]).length;
            const totalCount = completedChapters.length;
            const allReady = readyCount === totalCount;
            return (
              <div className="border-t border-white/10 pt-4 mb-4">
                <div className={`p-4 rounded-lg ${allReady ? "bg-emerald-500/10 border border-emerald-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{bulkGenerating ? "⏳" : allReady ? "✅" : "⚠️"}</span>
                    <div className="flex-1">
                      {bulkGenerating ? (
                        <>
                          <p className="text-sm font-medium text-blue-300">
                            Generazione riassunto {bulkProgress.current}/{bulkProgress.total}...
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{bulkProgress.chapterName}</p>
                        </>
                      ) : (
                        <p className={`text-sm font-medium ${allReady ? "text-emerald-300" : "text-amber-300"}`}>
                          {allReady
                            ? "Tutti i riassunti sono pronti! Puoi scaricare il PDF completo."
                            : `${readyCount}/${totalCount} capitoli riassunti.`
                          }
                        </p>
                      )}
                    </div>
                    {!allReady && !bulkGenerating && (
                      <button
                        onClick={generateAllMissingSummaries}
                        className="px-4 py-2 bg-amber-500/20 text-amber-300 rounded-lg hover:bg-amber-500/30 transition-colors text-sm font-medium whitespace-nowrap"
                      >
                        Genera mancanti ({totalCount - readyCount})
                      </button>
                    )}
                    <span className={`text-sm font-bold ${bulkGenerating ? "text-blue-400" : allReady ? "text-emerald-400" : "text-amber-400"}`}>
                      {readyCount}/{totalCount}
                    </span>
                  </div>
                  {bulkGenerating && (
                    <div className="mt-3">
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Image generation status */}
          {(() => {
            const allReady = completedChapters.every(c => chapterSummaries[c.id]);
            const hasImages = summaryImages.length > 0;
            return allReady ? (
              <div className="mb-4">
                <div className={`p-4 rounded-lg ${hasImages ? "bg-purple-500/10 border border-purple-500/20" : imageGenerating ? "bg-blue-500/10 border border-blue-500/20" : "bg-slate-500/10 border border-slate-500/20"}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{imageGenerating ? "⏳" : hasImages ? "🖼️" : "🎨"}</span>
                    <div className="flex-1">
                      {imageGenerating ? (
                        <>
                          <p className="text-sm font-medium text-blue-300">
                            {imageProgress.total > 0
                              ? `Immagine ${Math.min(imageProgress.current + 1, imageProgress.total)} di ${imageProgress.total}`
                              : "Preparazione generazione immagini..."}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{imageProgress.step}</p>
                        </>
                      ) : hasImages ? (
                        <p className="text-sm font-medium text-purple-300">
                          {summaryImages.length} immagini pronte per il PDF
                        </p>
                      ) : (
                        <p className="text-sm font-medium text-slate-400">
                          Nessuna immagine generata per il riassunto intero
                        </p>
                      )}
                    </div>
                    {!imageGenerating && (
                      <button
                        onClick={generateSummaryImages}
                        className={`px-4 py-2 rounded-lg transition-colors text-sm font-medium whitespace-nowrap ${
                          hasImages
                            ? "bg-purple-500/20 text-purple-300 hover:bg-purple-500/30"
                            : "bg-blue-500/20 text-blue-300 hover:bg-blue-500/30"
                        }`}
                      >
                        {hasImages ? "Rigenera immagini" : "Genera 5 immagini"}
                      </button>
                    )}
                  </div>
                  {imageGenerating && imageProgress.total > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                        <span>{imageProgress.step}</span>
                        <span>{Math.round((imageProgress.current / imageProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all duration-700"
                          style={{ width: `${(imageProgress.current / imageProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null;
          })()}

          {/* Chapter index */}
          <div className="border-t border-white/10 pt-4">
            <h4 className="text-slate-400 text-sm font-medium mb-3">Indice dei capitoli</h4>
            <div className="space-y-2">
              {completedChapters.map((chapter, idx) => (
                <div key={chapter.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/5 transition-colors">
                  <span className="text-slate-500 text-sm font-mono w-6">{idx + 1}.</span>
                  <span className="text-slate-300 text-sm flex-1">{chapter.title}</span>
                  {chapterSummaries[chapter.id] ? (
                    <span className="text-emerald-400 text-xs">Riassunto pronto</span>
                  ) : (
                    <span className="text-amber-400 text-xs">Da riassumere</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* ── CHAPTERS VIEW ── */
        <div className="space-y-4">
          {/* Rigenera tutti button */}
          <div className="flex justify-end">
            <button
              onClick={regenerateAllSummaries}
              disabled={bulkGenerating}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {bulkGenerating
                ? `Rigenerando ${bulkProgress.current}/${bulkProgress.total}...`
                : "Rigenera tutti i riassunti"}
            </button>
          </div>

          {completedChapters.map((chapter) => (
            <div
              key={chapter.id}
              className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-5 hover:border-blue-500/30 transition-all"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl flex items-center justify-center shrink-0">
                    <span className="text-2xl">📄</span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-white font-semibold text-lg truncate">{chapter.title}</h3>
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

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openReadMode(chapter)}
                    className="flex items-center justify-center gap-2 w-[100px] py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors text-sm font-medium"
                  >
                    <span>📖</span>
                    Leggi
                  </button>
                  <button
                    onClick={() => openGenerateModal(chapter.id)}
                    className="flex items-center justify-center gap-2 w-[160px] py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
                  >
                    Genera Riassunto
                  </button>
                  <button
                    onClick={() => requestPdfDownload(
                      chapter.processed_text || "",
                      chapter.title,
                      chapter.id
                    )}
                    disabled={pdfGenerating}
                    className="flex items-center justify-center gap-2 w-[80px] py-2.5 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* PDF Download Info Dialog (full book without images) */}
      {showPdfDialog && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => setShowPdfDialog(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl min-w-[360px] max-w-[420px]">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">📝</span>
                <h3 className="text-white font-semibold text-lg">PDF solo testo</h3>
              </div>
              <p className="text-slate-300 text-sm mb-2">
                Stai per scaricare un riassunto di <strong className="text-white">solo testo</strong>, senza immagini.
              </p>
              <p className="text-slate-400 text-sm mb-5">
                Se vuoi un PDF con immagini educative, genera prima le immagini con il pulsante <strong className="text-purple-300">&quot;Genera 5 immagini&quot;</strong> nella sezione Libro Intero.
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => confirmPdfDownload()}
                  className="w-full py-3 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-xl transition-colors text-sm font-medium"
                >
                  Scarica solo testo
                </button>
                <button
                  onClick={() => setShowPdfDialog(false)}
                  className="w-full py-2.5 text-slate-400 hover:text-white text-sm transition-colors"
                >
                  Annulla
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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

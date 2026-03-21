"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TitleSlide   { type: "title"; title: string; subtitle?: string }
interface ContentSlide { type: "content"; title: string; bullets: string[]; note?: string }
interface FormulaSlide { type: "formula"; title: string; latex: string; explanation: string }
interface ComparisonSlide { type: "comparison"; title: string; left: { label: string; points: string[] }; right: { label: string; points: string[] } }
interface TimelineSlide { type: "timeline"; title: string; steps: { label: string; description: string }[] }
interface SummarySlide  { type: "summary"; title: string; points: string[] }

type Slide = TitleSlide | ContentSlide | FormulaSlide | ComparisonSlide | TimelineSlide | SummarySlide;

interface PresentationData { title: string; slides: Slide[] }

// ─── Slide renderers ──────────────────────────────────────────────────────────

function SlideTitle({ slide }: { slide: TitleSlide }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-16">
      <div className="w-20 h-1 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-8" />
      <h1 className="text-5xl font-bold text-white mb-6 leading-tight">{slide.title}</h1>
      {slide.subtitle && <p className="text-2xl text-slate-300 font-light">{slide.subtitle}</p>}
      <div className="w-20 h-1 bg-gradient-to-r from-purple-600 to-blue-500 rounded-full mt-8" />
    </div>
  );
}

function SlideContent({ slide }: { slide: ContentSlide }) {
  return (
    <div className="flex flex-col h-full px-14 py-10">
      <h2 className="text-3xl font-bold text-white mb-8 pb-4 border-b border-white/10">{slide.title}</h2>
      <ul className="flex-1 space-y-4">
        {slide.bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-4">
            <span className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0 mt-0.5">
              {i + 1}
            </span>
            <span className="text-slate-200 text-xl leading-relaxed">{b}</span>
          </li>
        ))}
      </ul>
      {slide.note && (
        <p className="text-slate-500 text-sm mt-4 italic border-t border-white/5 pt-3">{slide.note}</p>
      )}
    </div>
  );
}

function SlideFormula({ slide }: { slide: FormulaSlide }) {
  return (
    <div className="flex flex-col h-full px-14 py-10">
      <h2 className="text-3xl font-bold text-white mb-8 pb-4 border-b border-white/10">{slide.title}</h2>
      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <div className="bg-white/5 border border-emerald-500/30 rounded-2xl px-10 py-8 text-center w-full max-w-2xl">
          <p className="text-emerald-300 font-mono text-3xl tracking-wide">{slide.latex}</p>
        </div>
        <p className="text-slate-300 text-xl text-center max-w-2xl leading-relaxed">{slide.explanation}</p>
      </div>
    </div>
  );
}

function SlideComparison({ slide }: { slide: ComparisonSlide }) {
  return (
    <div className="flex flex-col h-full px-14 py-10">
      <h2 className="text-3xl font-bold text-white mb-6 pb-4 border-b border-white/10">{slide.title}</h2>
      <div className="flex-1 grid grid-cols-2 gap-6">
        {[slide.left, slide.right].map((side, idx) => (
          <div key={idx} className={`rounded-2xl p-6 border ${idx === 0 ? "bg-blue-500/10 border-blue-500/30" : "bg-purple-500/10 border-purple-500/30"}`}>
            <h3 className={`text-xl font-bold mb-4 ${idx === 0 ? "text-blue-300" : "text-purple-300"}`}>{side.label}</h3>
            <ul className="space-y-3">
              {side.points.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-slate-300 text-lg">
                  <span className={`mt-2 w-2 h-2 rounded-full shrink-0 ${idx === 0 ? "bg-blue-400" : "bg-purple-400"}`} />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideTimeline({ slide }: { slide: TimelineSlide }) {
  return (
    <div className="flex flex-col h-full px-14 py-10">
      <h2 className="text-3xl font-bold text-white mb-8 pb-4 border-b border-white/10">{slide.title}</h2>
      <div className="flex-1 flex flex-col justify-center space-y-4">
        {slide.steps.map((step, i) => (
          <div key={i} className="flex items-start gap-4">
            <div className="flex flex-col items-center shrink-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                {i + 1}
              </div>
              {i < slide.steps.length - 1 && <div className="w-0.5 h-6 bg-white/10 mt-1" />}
            </div>
            <div>
              <p className="text-white font-semibold text-lg">{step.label}</p>
              <p className="text-slate-400 text-base">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideSummary({ slide }: { slide: SummarySlide }) {
  return (
    <div className="flex flex-col h-full px-14 py-10">
      <h2 className="text-3xl font-bold text-white mb-8 pb-4 border-b border-white/10">{slide.title}</h2>
      <div className="flex-1 grid grid-cols-2 gap-4 content-center">
        {slide.points.map((p, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
            <span className="text-2xl">✓</span>
            <p className="text-slate-200 text-lg leading-relaxed">{p}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlideRenderer({ slide }: { slide: Slide }) {
  switch (slide.type) {
    case "title":      return <SlideTitle slide={slide} />;
    case "content":    return <SlideContent slide={slide} />;
    case "formula":    return <SlideFormula slide={slide} />;
    case "comparison": return <SlideComparison slide={slide} />;
    case "timeline":   return <SlideTimeline slide={slide} />;
    case "summary":    return <SlideSummary slide={slide} />;
    default:           return null;
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SlidesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sourceId = params.id as string;

  const [source, setSource] = useState<Source | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>("__all__");
  const [presentation, setPresentation] = useState<PresentationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [exporting, setExporting] = useState(false);

  useBreadcrumb(
    source
      ? [
          { label: "I miei libri", href: "/dashboard" },
          { label: source.title, href: `/dashboard/source/${sourceId}` },
          { label: "Presentazione" },
        ]
      : []
  );

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user && sourceId) fetchData();
  }, [user, authLoading, sourceId]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!presentation) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") nextSlide();
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") prevSlide();
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [presentation, currentSlide]);

  const fetchData = async () => {
    setLoading(true);
    const { data: src } = await supabase.from("sources").select("*").eq("id", sourceId).single();
    if (src) setSource(src);

    const { data: chs } = await supabase
      .from("chapters")
      .select("id, title, processing_status, order_index")
      .eq("source_id", sourceId)
      .eq("processing_status", "completed")
      .order("order_index");
    if (chs) setChapters(chs as Chapter[]);

    const { data: existing } = await supabase
      .from("presentations")
      .select("content")
      .eq("source_id", sourceId)
      .eq("user_id", user!.id)
      .is("chapter_id", null)
      .single();
    if (existing) setPresentation(existing.content as PresentationData);

    setLoading(false);
  };

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    setError("");
    setCurrentSlide(0);

    await fetch("/api/slides/generate", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        chapterId: selectedChapterId === "__all__" ? null : selectedChapterId,
        userId: user.id,
      }),
    });

    const res = await fetch("/api/slides/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        chapterId: selectedChapterId === "__all__" ? null : selectedChapterId,
        userId: user.id,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setPresentation(data.presentation);
    } else {
      setError("Errore nella generazione. Riprova.");
    }
    setGenerating(false);
  };

  const nextSlide = useCallback(() => {
    if (!presentation) return;
    setCurrentSlide(s => Math.min(s + 1, presentation.slides.length - 1));
  }, [presentation]);

  const prevSlide = useCallback(() => {
    setCurrentSlide(s => Math.max(s - 1, 0));
  }, []);

  const exportPdf = async () => {
    if (!presentation) return;
    setExporting(true);
    const jsPDF = (await import("jspdf")).default;
    const html2canvas = (await import("html2canvas")).default;

    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const slideEls = document.querySelectorAll(".slide-export");

    for (let i = 0; i < slideEls.length; i++) {
      const canvas = await html2canvas(slideEls[i] as HTMLElement, {
        backgroundColor: "#0F172A",
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, 0, 297, 210);
    }

    pdf.save(`${presentation.title.replace(/\s+/g, "_")}_presentazione.pdf`);
    setExporting(false);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500" />
      </div>
    );
  }

  const slides = presentation?.slides || [];
  const slide = slides[currentSlide];

  return (
    <div className={`flex flex-col ${fullscreen ? "fixed inset-0 z-50 bg-slate-950" : "h-[calc(100vh-64px)]"}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          {!fullscreen && (
            <>
              <Link
                href={`/dashboard/source/${sourceId}`}
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                {source?.title}
              </Link>
              <span className="text-slate-600">/</span>
            </>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <h1 className="text-white font-semibold">
              {presentation?.title || "Presentazione"}
            </h1>
          </div>
          {presentation && (
            <span className="text-slate-500 text-sm">
              {currentSlide + 1} / {slides.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {chapters.length > 1 && !presentation && (
            <select
              value={selectedChapterId}
              onChange={e => setSelectedChapterId(e.target.value)}
              className="bg-white/5 border border-white/10 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
            >
              <option value="__all__">Libro intero</option>
              {chapters.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.title}</option>
              ))}
            </select>
          )}

          {presentation && (
            <>
              <button
                onClick={() => setFullscreen(f => !f)}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 text-slate-300 rounded-lg hover:bg-white/10 transition-colors text-sm"
                title={fullscreen ? "Esci dal fullscreen" : "Fullscreen"}
              >
                {fullscreen ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>

              <button
                onClick={exportPdf}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg hover:bg-emerald-500/30 transition-colors text-sm disabled:opacity-50"
              >
                {exporting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-400" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                )}
                Esporta PDF
              </button>
            </>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || chapters.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Generando...
              </>
            ) : presentation ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Rigenera
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Genera Slides
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm shrink-0">
          {error}
        </div>
      )}

      {/* Main content */}
      {!presentation && !generating ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl flex items-center justify-center">
            <span className="text-5xl">🎯</span>
          </div>
          <h3 className="text-white font-semibold text-xl">Nessuna presentazione generata</h3>
          <p className="text-slate-400 text-center max-w-sm">
            Genera una presentazione professionale del tuo materiale di studio
          </p>
          {chapters.length === 0 && (
            <p className="text-amber-400 text-sm">Elabora prima un capitolo per generare le slides</p>
          )}
        </div>
      ) : generating ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
          <p className="text-slate-300">Generando la presentazione con Gemini...</p>
        </div>
      ) : (
        <div className="flex-1 flex gap-0 overflow-hidden">
          {/* Slide thumbnails sidebar */}
          {!fullscreen && (
            <div className="w-48 border-r border-white/10 overflow-y-auto shrink-0 bg-slate-950/50">
              {slides.map((s, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`w-full text-left p-3 border-b border-white/5 transition-colors hover:bg-white/5 ${
                    i === currentSlide ? "bg-blue-500/10 border-l-2 border-l-blue-500" : ""
                  }`}
                >
                  <div className="text-slate-500 text-xs mb-1">{i + 1}</div>
                  <div className="text-slate-300 text-xs font-medium truncate">{s.title}</div>
                  <div className={`text-xs mt-1 ${
                    s.type === "title" ? "text-blue-400" :
                    s.type === "formula" ? "text-emerald-400" :
                    s.type === "comparison" ? "text-purple-400" :
                    s.type === "summary" ? "text-amber-400" :
                    "text-slate-500"
                  }`}>{s.type}</div>
                </button>
              ))}
            </div>
          )}

          {/* Slide viewer */}
          <div className="flex-1 flex flex-col">
            {/* Slide */}
            <div className="flex-1 flex items-center justify-center p-8 bg-slate-950">
              <div
                className="slide-export relative w-full max-w-5xl aspect-video bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
                style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)" }}
              >
                {/* Decorative elements */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                {/* Slide number */}
                <div className="absolute top-4 right-6 text-slate-700 text-sm font-mono">
                  {currentSlide + 1}/{slides.length}
                </div>

                {slide && <SlideRenderer slide={slide} />}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-center gap-4 py-4 shrink-0 border-t border-white/5">
              <button
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              {/* Dot indicators */}
              <div className="flex items-center gap-1.5">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentSlide(i)}
                    className={`rounded-full transition-all ${
                      i === currentSlide
                        ? "w-6 h-2 bg-blue-500"
                        : "w-2 h-2 bg-white/20 hover:bg-white/40"
                    }`}
                  />
                ))}
              </div>

              <button
                onClick={nextSlide}
                disabled={currentSlide === slides.length - 1}
                className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden slides for PDF export */}
      {presentation && (
        <div className="fixed left-[-9999px] top-0 pointer-events-none">
          {slides.map((s, i) => (
            <div
              key={i}
              className="slide-export"
              style={{
                width: "1122px",
                height: "794px",
                background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
                position: "relative",
                overflow: "hidden",
                color: "white",
              }}
            >
              <SlideRenderer slide={s} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter } from "@/lib/supabase";
import { renderLatex } from "@/lib/latex";

// ─── Section Types ──────────────────────────────────────────────────────────

interface HeroSection { type: "hero"; title: string; subtitle: string; icon?: string }
interface StatsSection { type: "stats"; title: string; items: { value: string; label: string; icon?: string }[] }
interface ConceptsSection { type: "concepts"; title: string; items: { term: string; description: string; color?: string }[] }
interface FlowSection { type: "flow"; title: string; steps: { label: string; description: string }[] }
interface ComparisonSection { type: "comparison"; title: string; left: { label: string; points: string[]; color?: string }; right: { label: string; points: string[]; color?: string } }
interface FormulasSection { type: "formulas"; title: string; items: { name: string; latex: string; meaning: string }[] }
interface TimelineSection { type: "timeline"; title: string; events: { label: string; description: string }[] }
interface KeypointsSection { type: "keypoints"; title: string; points: string[] }
interface RelationshipsSection { type: "relationships"; title: string; items: { from: string; to: string; relation: string }[] }
interface CategoriesSection { type: "categories"; title: string; groups: { name: string; items: string[]; color?: string }[] }

type Section = HeroSection | StatsSection | ConceptsSection | FlowSection | ComparisonSection | FormulasSection | TimelineSection | KeypointsSection | RelationshipsSection | CategoriesSection;

interface InfographicData {
  title: string;
  sections: Section[];
}

// ─── Color Helpers ──────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; gradient: string }> = {
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-500/30",    text: "text-blue-400",    gradient: "from-blue-500 to-blue-600" },
  purple:  { bg: "bg-purple-500/10",  border: "border-purple-500/30",  text: "text-purple-400",  gradient: "from-purple-500 to-purple-600" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", gradient: "from-emerald-500 to-emerald-600" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/30",   text: "text-amber-400",   gradient: "from-amber-500 to-amber-600" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/30",    text: "text-rose-400",    gradient: "from-rose-500 to-rose-600" },
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/30",    text: "text-cyan-400",    gradient: "from-cyan-500 to-cyan-600" },
};

function getColor(c?: string) { return COLOR_MAP[c || "blue"] || COLOR_MAP.blue; }

const SECTION_COLORS = ["blue", "purple", "emerald", "amber", "rose", "cyan"];
function autoColor(index: number) { return SECTION_COLORS[index % SECTION_COLORS.length]; }

// ─── Section Renderers ──────────────────────────────────────────────────────

function SectionHero({ section }: { section: HeroSection }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600/20 via-purple-600/20 to-emerald-600/20 border border-white/10 p-10 text-center">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-purple-500/10" />
      <div className="relative z-10">
        {section.icon && <div className="text-6xl mb-4">{section.icon}</div>}
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">{section.title}</h1>
        <p className="text-lg text-slate-300 max-w-2xl mx-auto">{section.subtitle}</p>
      </div>
    </div>
  );
}

function SectionStats({ section }: { section: StatsSection }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full" />
        {section.title}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {section.items.map((item, i) => (
          <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 text-center hover:border-white/20 transition-colors">
            {item.icon && <div className="text-2xl mb-2">{item.icon}</div>}
            <div className="text-2xl font-bold text-white mb-1">{item.value}</div>
            <div className="text-sm text-slate-400">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionConcepts({ section, sectionIndex }: { section: ConceptsSection; sectionIndex: number }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className={`w-1 h-6 bg-gradient-to-b ${getColor(autoColor(sectionIndex)).gradient} rounded-full`} />
        {section.title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {section.items.map((item, i) => {
          const c = getColor(item.color || autoColor(i));
          return (
            <div key={i} className={`${c.bg} border ${c.border} rounded-xl p-5 hover:scale-[1.02] transition-transform`}>
              <h4 className={`font-semibold ${c.text} mb-2 text-base`}>{item.term}</h4>
              <p className="text-slate-300 text-sm leading-relaxed">{item.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionFlow({ section, sectionIndex }: { section: FlowSection; sectionIndex: number }) {
  const c = getColor(autoColor(sectionIndex));
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className={`w-1 h-6 bg-gradient-to-b ${c.gradient} rounded-full`} />
        {section.title}
      </h3>
      <div className="relative">
        <div className={`absolute left-6 top-0 bottom-0 w-0.5 ${c.bg} border-l ${c.border}`} />
        <div className="space-y-6">
          {section.steps.map((step, i) => (
            <div key={i} className="flex items-start gap-4 relative">
              <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${c.gradient} flex items-center justify-center shrink-0 z-10 shadow-lg`}>
                <span className="text-white font-bold text-sm">{i + 1}</span>
              </div>
              <div className="pt-2 flex-1">
                <h4 className="font-semibold text-white text-base">{step.label}</h4>
                <p className="text-slate-400 text-sm mt-1">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionComparison({ section }: { section: ComparisonSection }) {
  const leftC = getColor(section.left.color || "blue");
  const rightC = getColor(section.right.color || "purple");
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full" />
        {section.title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`${leftC.bg} border ${leftC.border} rounded-xl p-6`}>
          <h4 className={`font-semibold ${leftC.text} mb-3 text-lg`}>{section.left.label}</h4>
          <ul className="space-y-2">
            {section.left.points.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
                <span className={`w-1.5 h-1.5 rounded-full bg-blue-400 mt-2 shrink-0`} />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div className={`${rightC.bg} border ${rightC.border} rounded-xl p-6`}>
          <h4 className={`font-semibold ${rightC.text} mb-3 text-lg`}>{section.right.label}</h4>
          <ul className="space-y-2">
            {section.right.points.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-slate-300 text-sm">
                <span className={`w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 shrink-0`} />
                {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SectionFormulas({ section }: { section: FormulasSection }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-gradient-to-b from-emerald-500 to-cyan-500 rounded-full" />
        {section.title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {section.items.map((item, i) => (
          <div key={i} className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5">
            <h4 className="font-semibold text-emerald-400 mb-3 text-sm uppercase tracking-wider">{item.name}</h4>
            <div
              className="text-center py-3 text-xl"
              dangerouslySetInnerHTML={{ __html: renderLatex(item.latex, true) }}
            />
            <p className="text-slate-400 text-sm mt-3 border-t border-emerald-500/10 pt-3">{item.meaning}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionTimeline({ section, sectionIndex }: { section: TimelineSection; sectionIndex: number }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className={`w-1 h-6 bg-gradient-to-b ${getColor(autoColor(sectionIndex)).gradient} rounded-full`} />
        {section.title}
      </h3>
      <div className="space-y-4">
        {section.events.map((event, i) => (
          <div key={i} className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${getColor(autoColor(i)).gradient} shrink-0`} />
              {i < section.events.length - 1 && <div className="w-0.5 h-full bg-white/10 mt-1" />}
            </div>
            <div className="pb-4">
              <h4 className="font-semibold text-white text-sm">{event.label}</h4>
              <p className="text-slate-400 text-sm mt-0.5">{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionKeypoints({ section }: { section: KeypointsSection }) {
  return (
    <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl p-6">
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="text-xl">💡</span>
        {section.title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {section.points.map((point, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-amber-400 text-xs font-bold">{i + 1}</span>
            </span>
            <p className="text-slate-300 text-sm leading-relaxed">{point}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionRelationships({ section, sectionIndex }: { section: RelationshipsSection; sectionIndex: number }) {
  const c = getColor(autoColor(sectionIndex));
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className={`w-1 h-6 bg-gradient-to-b ${c.gradient} rounded-full`} />
        {section.title}
      </h3>
      <div className="space-y-3">
        {section.items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-5 py-4">
            <span className="font-semibold text-blue-400 text-sm whitespace-nowrap">{item.from}</span>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 h-px bg-gradient-to-r from-blue-500/50 to-purple-500/50" />
              <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full whitespace-nowrap">{item.relation}</span>
              <div className="flex-1 h-px bg-gradient-to-r from-purple-500/50 to-blue-500/50" />
            </div>
            <span className="font-semibold text-purple-400 text-sm whitespace-nowrap">{item.to}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionCategories({ section }: { section: CategoriesSection }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <span className="w-1 h-6 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full" />
        {section.title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {section.groups.map((group, i) => {
          const c = getColor(group.color || autoColor(i));
          return (
            <div key={i} className={`${c.bg} border ${c.border} rounded-xl p-5`}>
              <h4 className={`font-semibold ${c.text} mb-3`}>{group.name}</h4>
              <ul className="space-y-1.5">
                {group.items.map((item, j) => (
                  <li key={j} className="text-slate-300 text-sm flex items-center gap-2">
                    <span className={`w-1 h-1 rounded-full ${c.text.replace("text-", "bg-")} shrink-0`} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionRenderer({ section, index }: { section: Section; index: number }) {
  switch (section.type) {
    case "hero":          return <SectionHero section={section} />;
    case "stats":         return <SectionStats section={section} />;
    case "concepts":      return <SectionConcepts section={section} sectionIndex={index} />;
    case "flow":          return <SectionFlow section={section} sectionIndex={index} />;
    case "comparison":    return <SectionComparison section={section} />;
    case "formulas":      return <SectionFormulas section={section} />;
    case "timeline":      return <SectionTimeline section={section} sectionIndex={index} />;
    case "keypoints":     return <SectionKeypoints section={section} />;
    case "relationships": return <SectionRelationships section={section} sectionIndex={index} />;
    case "categories":    return <SectionCategories section={section} />;
    default:              return null;
  }
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function InfographicsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sourceId = params.id as string;
  const contentRef = useRef<HTMLDivElement>(null);

  const [source, setSource] = useState<Source | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>("__all__");
  const [infographic, setInfographic] = useState<InfographicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useBreadcrumb(
    source
      ? [
          { label: "I miei libri", href: "/dashboard" },
          { label: source.title, href: `/dashboard/source/${sourceId}` },
          { label: "Infografica" },
        ]
      : []
  );

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user && sourceId) fetchData();
  }, [user, authLoading, sourceId]);

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

    // Load existing infographic (whole book)
    const { data: existing } = await supabase
      .from("infographics")
      .select("content")
      .eq("source_id", sourceId)
      .eq("user_id", user!.id)
      .is("chapter_id", null)
      .single();
    if (existing) setInfographic(existing.content as InfographicData);

    setLoading(false);
  };

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    setError("");

    // Delete existing
    await fetch("/api/infographics/generate", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        chapterId: selectedChapterId === "__all__" ? null : selectedChapterId,
        userId: user.id,
      }),
    });

    const res = await fetch("/api/infographics/generate", {
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
      setInfographic(data.infographic);
    } else {
      setError("Errore nella generazione dell'infografica. Riprova.");
    }
    setGenerating(false);
  };

  const exportPng = useCallback(async () => {
    if (!contentRef.current) return;
    const h2c = (await import("html2canvas")).default;
    const canvas = await h2c(contentRef.current, {
      backgroundColor: "#0F172A",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${infographic?.title?.replace(/\s+/g, "_") || "infografica"}.png`;
    a.click();
  }, [infographic]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
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
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h1 className="text-white font-semibold">Infografica</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {chapters.length > 1 && (
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

          {infographic && (
            <button
              onClick={exportPng}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-slate-300 rounded-lg hover:bg-white/10 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Esporta PNG
            </button>
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
            ) : infographic ? (
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
                Genera Infografica
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!infographic && !generating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl flex items-center justify-center">
              <span className="text-5xl">📊</span>
            </div>
            <h3 className="text-white font-semibold text-xl">Nessuna infografica generata</h3>
            <p className="text-slate-400 text-center max-w-sm">
              Genera un&apos;infografica visuale per riassumere e visualizzare i concetti chiave
            </p>
            {chapters.length === 0 && (
              <p className="text-amber-400 text-sm">Elabora prima un capitolo per generare l&apos;infografica</p>
            )}
          </div>
        ) : generating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
            <p className="text-slate-300">Generando l&apos;infografica con Gemini...</p>
          </div>
        ) : infographic ? (
          <div ref={contentRef} className="max-w-4xl mx-auto px-6 py-8 space-y-8">
            {infographic.sections.map((section, i) => (
              <SectionRenderer key={i} section={section} index={i} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

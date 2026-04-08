"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/api-client";

interface AdminChapter {
  id: string;
  title: string;
  status: string;
  pages: number | null;
  chars: number | null;
  quality: number | null;
  method: string | null;
  order: number | null;
}

interface AdminSource {
  id: string;
  title: string;
  ownerName: string;
  ownerId: string;
  createdAt: string;
  hasFile: boolean;
  chaptersCount: number;
  completedChapters: number;
  erroredChapters: number;
  totalPages: number;
  totalChars: number;
  avgQuality: number;
  chapters: AdminChapter[];
}

interface ProblematicChapter {
  id: string;
  title: string;
  sourceTitle: string;
  sourceOwner: string;
  status: string;
  quality: number | null;
  method: string | null;
}

function fmt(n: number): string {
  return n.toLocaleString("it-IT");
}

function qualityColor(q: number): string {
  if (q >= 80) return "text-emerald-400";
  if (q >= 60) return "text-amber-400";
  return "text-rose-400";
}

export default function ContentTab() {
  const [sources, setSources] = useState<AdminSource[]>([]);
  const [problematic, setProblematic] = useState<ProblematicChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/admin/content");
        const data = await res.json();
        setSources(data.sources || []);
        setProblematic(data.problematicChapters || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return sources;
    const q = search.toLowerCase();
    return sources.filter(s =>
      s.title.toLowerCase().includes(q) ||
      s.ownerName.toLowerCase().includes(q)
    );
  }, [sources, search]);

  return (
    <div className="space-y-5">
      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Libri totali</p>
          <p className="text-white text-3xl font-bold mt-2">{sources.length}</p>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
          <p className="text-emerald-400 text-xs font-medium uppercase tracking-wider">Capitoli OK</p>
          <p className="text-white text-3xl font-bold mt-2">
            {fmt(sources.reduce((a, s) => a + s.completedChapters, 0))}
          </p>
        </div>
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-5">
          <p className="text-rose-400 text-xs font-medium uppercase tracking-wider">Capitoli con errori</p>
          <p className="text-white text-3xl font-bold mt-2">{problematic.length}</p>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5">
          <p className="text-blue-400 text-xs font-medium uppercase tracking-wider">Pagine totali</p>
          <p className="text-white text-3xl font-bold mt-2">
            {fmt(sources.reduce((a, s) => a + s.totalPages, 0))}
          </p>
        </div>
      </div>

      {/* Problematic chapters */}
      {problematic.length > 0 && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-5">
          <h3 className="text-rose-300 font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
            ⚠️ Capitoli con problemi ({problematic.length})
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {problematic.map(c => (
              <div key={c.id} className="flex items-center justify-between bg-slate-900/50 border border-white/5 rounded-lg px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{c.title}</p>
                  <p className="text-slate-500 text-xs truncate">{c.sourceTitle} • {c.sourceOwner}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {c.quality !== null && (
                    <span className={`text-xs font-mono ${qualityColor(c.quality)}`}>{c.quality}%</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.status === "error" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}>
                    {c.status === "error" ? "Errore" : "Bassa qualità"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All sources */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-white font-semibold text-base mb-3">Tutti i Libri</h3>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca per titolo o proprietario..."
              className="w-full bg-slate-800/50 border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Caricamento...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Nessun libro trovato</div>
        ) : (
          <div>
            {filtered.map(s => (
              <div key={s.id} className="border-b border-white/5 last:border-b-0">
                <button
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-white/5 transition-colors text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 flex items-center justify-center shrink-0">
                    📚
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{s.title}</p>
                    <p className="text-slate-500 text-xs truncate">
                      {s.ownerName} • {s.chaptersCount} capitoli • {fmt(s.totalPages)} pagine
                    </p>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    {s.avgQuality > 0 && (
                      <span className={`text-xs font-mono ${qualityColor(s.avgQuality)}`}>{s.avgQuality}%</span>
                    )}
                    {s.erroredChapters > 0 && (
                      <span className="text-xs text-rose-400">{s.erroredChapters} errori</span>
                    )}
                    <svg className={`w-4 h-4 text-slate-500 transition-transform ${expanded === s.id ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>

                {expanded === s.id && (
                  <div className="px-4 pb-4 pt-1 ml-12 space-y-1.5">
                    {s.chapters.map(c => (
                      <div key={c.id} className="flex items-center gap-3 bg-slate-900/30 rounded-lg px-3 py-2">
                        <span className="text-slate-500 text-xs font-mono w-6">{(c.order || 0) + 1}.</span>
                        <span className="flex-1 text-slate-300 text-sm truncate">{c.title}</span>
                        {c.pages !== null && (
                          <span className="text-slate-500 text-xs">{c.pages}p</span>
                        )}
                        {c.quality !== null && (
                          <span className={`text-xs font-mono ${qualityColor(c.quality)}`}>{c.quality}%</span>
                        )}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          c.status === "completed" ? "bg-emerald-500/15 text-emerald-300" :
                          c.status === "error" ? "bg-rose-500/15 text-rose-300" :
                          "bg-amber-500/15 text-amber-300"
                        }`}>
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

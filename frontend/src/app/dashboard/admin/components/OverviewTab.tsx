"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api-client";
import StatCard from "./StatCard";

interface Overview {
  totalUsers: number;
  activeUsers7d: number;
  activeUsers30d: number;
  newUsers30d: number;
  totalSources: number;
  totalChapters: number;
  completedChapters: number;
  failedChapters: number;
  totalPagesProcessed: number;
  totalFlashcards: number;
  totalQuizzes: number;
  totalSummaries: number;
  totalMindmaps: number;
  totalPresentations: number;
  totalInfographics: number;
  totalChatMessages: number;
}

interface AiUsage {
  totalCost30d: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  avgDurationMs: number;
  costsByAction: Record<string, number>;
}

function fmt(n: number): string {
  return n.toLocaleString("it-IT");
}

export default function OverviewTab() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/admin/stats");
        const data = await res.json();
        setOverview(data.overview);
        setAiUsage(data.aiUsage);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-28 bg-white/5 border border-white/10 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!overview || !aiUsage) {
    return (
      <div className="text-center py-12 text-slate-400">
        Errore caricamento statistiche
      </div>
    );
  }

  const successRate = aiUsage.totalCalls > 0
    ? Math.round((aiUsage.successCalls / aiUsage.totalCalls) * 100)
    : 100;

  return (
    <div className="space-y-8">
      {/* Section: Utenti */}
      <section>
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-1 h-5 bg-gradient-to-b from-blue-500 to-purple-500 rounded-full" />
          Utenti
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Utenti totali" value={fmt(overview.totalUsers)} icon="👥" color="blue" large />
          <StatCard label="Attivi (7gg)" value={fmt(overview.activeUsers7d)} icon="🟢" color="emerald" />
          <StatCard label="Attivi (30gg)" value={fmt(overview.activeUsers30d)} icon="🟢" color="cyan" />
          <StatCard label="Nuovi (30gg)" value={fmt(overview.newUsers30d)} icon="✨" color="purple" />
        </div>
      </section>

      {/* Section: Contenuti */}
      <section>
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-1 h-5 bg-gradient-to-b from-emerald-500 to-cyan-500 rounded-full" />
          Contenuti elaborati
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Libri" value={fmt(overview.totalSources)} icon="📚" color="emerald" />
          <StatCard label="Capitoli" value={fmt(overview.totalChapters)} icon="📖" color="blue" subtitle={`${overview.completedChapters} completati, ${overview.failedChapters} con errori`} />
          <StatCard label="Pagine totali" value={fmt(overview.totalPagesProcessed)} icon="📄" color="cyan" />
          <StatCard label="Messaggi chat" value={fmt(overview.totalChatMessages)} icon="💬" color="purple" />
        </div>
      </section>

      {/* Section: Generazioni AI */}
      <section>
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-1 h-5 bg-gradient-to-b from-purple-500 to-rose-500 rounded-full" />
          Generazioni AI totali
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard label="Flashcard" value={fmt(overview.totalFlashcards)} icon="🎴" color="purple" />
          <StatCard label="Quiz" value={fmt(overview.totalQuizzes)} icon="📝" color="emerald" />
          <StatCard label="Riassunti" value={fmt(overview.totalSummaries)} icon="📄" color="blue" />
          <StatCard label="Mappe" value={fmt(overview.totalMindmaps)} icon="🗺️" color="cyan" />
          <StatCard label="Slides" value={fmt(overview.totalPresentations)} icon="🎯" color="amber" />
          <StatCard label="Infografiche" value={fmt(overview.totalInfographics)} icon="📊" color="rose" />
        </div>
      </section>

      {/* Section: AI Usage */}
      <section>
        <h2 className="text-white font-semibold text-sm uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-1 h-5 bg-gradient-to-b from-amber-500 to-orange-500 rounded-full" />
          Costi AI ultimi 30 giorni
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Costo stimato" value={`$${aiUsage.totalCost30d.toFixed(2)}`} icon="💰" color="amber" large />
          <StatCard label="Chiamate totali" value={fmt(aiUsage.totalCalls)} icon="📞" color="blue" />
          <StatCard label="Successo" value={`${successRate}%`} icon="✓" color={successRate >= 95 ? "emerald" : successRate >= 80 ? "amber" : "rose"} subtitle={`${aiUsage.errorCalls} errori`} />
          <StatCard label="Latenza media" value={`${(aiUsage.avgDurationMs / 1000).toFixed(1)}s`} icon="⏱️" color="cyan" />
        </div>

        {Object.keys(aiUsage.costsByAction).length > 0 && (
          <div className="mt-4 bg-white/5 border border-white/10 rounded-2xl p-5">
            <h3 className="text-white font-medium text-sm mb-4">Costi per tipo di operazione</h3>
            <div className="space-y-3">
              {Object.entries(aiUsage.costsByAction)
                .sort(([, a], [, b]) => b - a)
                .map(([action, cost]) => {
                  const max = Math.max(...Object.values(aiUsage.costsByAction));
                  const pct = max > 0 ? (cost / max) * 100 : 0;
                  return (
                    <div key={action}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-300 capitalize">{action.replace(/_/g, " ")}</span>
                        <span className="text-slate-400 font-mono">${cost.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

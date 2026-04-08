"use client";

import { useEffect, useState } from "react";
import { authFetch } from "@/lib/api-client";

interface UsageData {
  summary: {
    totalCost: number;
    totalCalls: number;
    totalErrors: number;
    totalTokensIn: number;
    totalTokensOut: number;
    successRate: number;
  };
  byAction: Record<string, { count: number; tokensIn: number; tokensOut: number; cost: number; errors: number; avgDurationMs: number }>;
  byModel: Record<string, { count: number; tokensIn: number; tokensOut: number; cost: number }>;
  byDay: Array<{ day: string; calls: number; cost: number; errors: number }>;
  recentErrors: Array<{ action: string; model: string; error: string; createdAt: string }>;
}

function fmt(n: number): string {
  return n.toLocaleString("it-IT");
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function UsageTab() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/admin/usage");
        const json = await res.json();
        setData(json);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-slate-400">Caricamento...</div>;
  }
  if (!data) {
    return <div className="text-center py-12 text-slate-400">Nessun dato disponibile</div>;
  }

  const maxDailyCost = Math.max(...data.byDay.map(d => d.cost), 0.01);

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
          <p className="text-amber-400 text-xs font-medium uppercase tracking-wider">Costo 30gg</p>
          <p className="text-white text-3xl font-bold mt-2">${data.summary.totalCost.toFixed(2)}</p>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5">
          <p className="text-blue-400 text-xs font-medium uppercase tracking-wider">Chiamate AI</p>
          <p className="text-white text-3xl font-bold mt-2">{fmt(data.summary.totalCalls)}</p>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
          <p className="text-emerald-400 text-xs font-medium uppercase tracking-wider">Successo</p>
          <p className="text-white text-3xl font-bold mt-2">{data.summary.successRate}%</p>
        </div>
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-5">
          <p className="text-purple-400 text-xs font-medium uppercase tracking-wider">Token totali</p>
          <p className="text-white text-3xl font-bold mt-2">{fmtTokens(data.summary.totalTokensIn + data.summary.totalTokensOut)}</p>
        </div>
      </div>

      {/* Daily chart */}
      {data.byDay.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-semibold text-sm mb-4">Andamento giornaliero (ultimi 30gg)</h3>
          <div className="flex items-end gap-1 h-32">
            {data.byDay.map(d => {
              const h = (d.cost / maxDailyCost) * 100;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center group relative">
                  <div className="w-full bg-slate-800 rounded-t hover:bg-slate-700 transition-colors relative" style={{ height: `${Math.max(h, 2)}%` }}>
                    <div className="absolute inset-0 bg-gradient-to-t from-amber-500/40 to-orange-500/30 rounded-t" />
                  </div>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 border border-white/10 rounded px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                    <p className="font-mono">${d.cost.toFixed(3)}</p>
                    <p className="text-slate-500">{d.day}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Two columns: by action and by model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* By action */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-semibold text-sm mb-4">Per tipo di operazione</h3>
          <div className="space-y-3">
            {Object.entries(data.byAction)
              .sort(([, a], [, b]) => b.cost - a.cost)
              .map(([action, stats]) => (
                <div key={action} className="bg-slate-900/40 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-medium capitalize">{action.replace(/_/g, " ")}</span>
                    <span className="text-amber-400 text-sm font-mono">${stats.cost.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>{fmt(stats.count)} chiamate</span>
                    {stats.errors > 0 && <span className="text-rose-400">{stats.errors} errori</span>}
                    <span className="ml-auto">{(stats.avgDurationMs / 1000).toFixed(1)}s avg</span>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* By model */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <h3 className="text-white font-semibold text-sm mb-4">Per modello AI</h3>
          <div className="space-y-3">
            {Object.entries(data.byModel)
              .sort(([, a], [, b]) => b.cost - a.cost)
              .map(([model, stats]) => (
                <div key={model} className="bg-slate-900/40 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-xs font-mono truncate flex-1">{model}</span>
                    <span className="text-amber-400 text-sm font-mono ml-2">${stats.cost.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>{fmt(stats.count)} chiamate</span>
                    <span className="ml-auto">{fmtTokens(stats.tokensIn + stats.tokensOut)} token</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Recent errors */}
      {data.recentErrors.length > 0 && (
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-5">
          <h3 className="text-rose-300 font-semibold text-sm mb-4 flex items-center gap-2">
            ⚠️ Errori recenti ({data.recentErrors.length})
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {data.recentErrors.map((e, i) => (
              <div key={i} className="bg-slate-900/50 rounded-lg p-3 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-rose-300 font-medium capitalize">{e.action}</span>
                  <span className="text-slate-500">{new Date(e.createdAt).toLocaleString("it-IT")}</span>
                </div>
                <p className="text-slate-400 font-mono text-xs truncate">{e.model}</p>
                <p className="text-slate-300 mt-1">{e.error}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

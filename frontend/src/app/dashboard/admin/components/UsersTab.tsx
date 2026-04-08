"use client";

import { useEffect, useMemo, useState } from "react";
import { authFetch } from "@/lib/api-client";

interface AdminUser {
  id: string;
  displayName: string;
  language: string;
  onboardingCompleted: boolean;
  createdAt: string;
  lastActivity: string | null;
  sourcesCount: number;
  chaptersCount: number;
  pagesCount: number;
  flashcardsCount: number;
  quizzesCount: number;
  summariesCount: number;
  mindmapsCount: number;
  presentationsCount: number;
  infographicsCount: number;
  conversationsCount: number;
  messagesCount: number;
  level: "Principiante" | "Intermedio" | "Avanzato";
}

const LEVEL_COLORS = {
  Principiante: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  Intermedio: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  Avanzato: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
};

function timeAgo(dateString: string | null): string {
  if (!dateString) return "Mai";
  const date = new Date(dateString);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Ora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `circa ${hours} ${hours === 1 ? "ora" : "ore"} fa`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? "giorno" : "giorni"} fa`;
  const months = Math.floor(days / 30);
  return `${months} ${months === 1 ? "mese" : "mesi"} fa`;
}

export default function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/admin/users");
        const data = await res.json();
        setUsers(data.users || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return users;
    const q = search.toLowerCase();
    return users.filter(u =>
      u.displayName.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    );
  }, [users, search]);

  const stats = useMemo(() => {
    const byLevel = { Principiante: 0, Intermedio: 0, Avanzato: 0 };
    for (const u of users) byLevel[u.level]++;
    return byLevel;
  }, [users]);

  return (
    <div className="space-y-5">
      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
          <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">Totali</p>
          <p className="text-white text-3xl font-bold mt-2">{users.length}</p>
        </div>
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5">
          <p className="text-blue-400 text-xs font-medium uppercase tracking-wider">Principianti</p>
          <p className="text-white text-3xl font-bold mt-2">{stats.Principiante}</p>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
          <p className="text-amber-400 text-xs font-medium uppercase tracking-wider">Intermedi</p>
          <p className="text-white text-3xl font-bold mt-2">{stats.Intermedio}</p>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5">
          <p className="text-emerald-400 text-xs font-medium uppercase tracking-wider">Avanzati</p>
          <p className="text-white text-3xl font-bold mt-2">{stats.Avanzato}</p>
        </div>
      </div>

      {/* User list */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-white font-semibold text-base mb-3">Elenco Studenti</h3>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Cerca studente..."
              className="w-full bg-slate-800/50 border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Caricamento...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-400">Nessuno studente trovato</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Nome</th>
                  <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Livello</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Libri</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Flashcard</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Domande AI</th>
                  <th className="text-right text-xs font-medium text-slate-500 uppercase tracking-wider px-4 py-3">Ultimo accesso</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                          {u.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{u.displayName}</p>
                          <p className="text-slate-500 text-xs font-mono truncate">{u.id.slice(0, 12)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${LEVEL_COLORS[u.level]}`}>
                        {u.level}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-300 text-sm font-mono">{u.sourcesCount}</td>
                    <td className="px-4 py-3 text-right text-slate-300 text-sm font-mono">{u.flashcardsCount}</td>
                    <td className="px-4 py-3 text-right text-slate-300 text-sm font-mono">{u.messagesCount}</td>
                    <td className="px-4 py-3 text-right text-slate-400 text-xs">{timeAgo(u.lastActivity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* User detail modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSelectedUser(null)} />
          <div className="relative bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xl font-bold">
                  {selectedUser.displayName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-white text-xl font-bold">{selectedUser.displayName}</h3>
                  <p className="text-slate-500 text-xs font-mono mt-0.5">{selectedUser.id}</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border mt-2 ${LEVEL_COLORS[selectedUser.level]}`}>
                    {selectedUser.level}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-slate-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: "Libri", value: selectedUser.sourcesCount, icon: "📚" },
                { label: "Capitoli", value: selectedUser.chaptersCount, icon: "📖" },
                { label: "Pagine", value: selectedUser.pagesCount, icon: "📄" },
                { label: "Flashcard", value: selectedUser.flashcardsCount, icon: "🎴" },
                { label: "Quiz", value: selectedUser.quizzesCount, icon: "📝" },
                { label: "Riassunti", value: selectedUser.summariesCount, icon: "📑" },
                { label: "Mappe", value: selectedUser.mindmapsCount, icon: "🗺️" },
                { label: "Slides", value: selectedUser.presentationsCount, icon: "🎯" },
                { label: "Infografiche", value: selectedUser.infographicsCount, icon: "📊" },
                { label: "Conversazioni", value: selectedUser.conversationsCount, icon: "💬" },
                { label: "Messaggi AI", value: selectedUser.messagesCount, icon: "🤖" },
                { label: "Lingua", value: selectedUser.language || "—", icon: "🌐" },
              ].map(item => (
                <div key={item.label} className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base">{item.icon}</span>
                    <p className="text-slate-500 text-xs uppercase tracking-wider">{item.label}</p>
                  </div>
                  <p className="text-white text-xl font-bold">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 pt-5 border-t border-white/10 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-slate-500 text-xs">Iscritto il</p>
                <p className="text-slate-300">{new Date(selectedUser.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Ultimo accesso</p>
                <p className="text-slate-300">{timeAgo(selectedUser.lastActivity)}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

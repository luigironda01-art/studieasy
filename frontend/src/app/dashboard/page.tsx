"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { useLayout } from "@/contexts/LayoutContext";
import { supabase, Source } from "@/lib/supabase";
import AddSourceModal from "@/components/AddSourceModal";
import Link from "next/link";

interface DueCardInfo {
  sourceId: string;
  sourceTitle: string;
  sourceType: string;
  chapterId: string;
  chapterTitle: string;
  dueCount: number;
  estimatedMinutes: number;
}

interface DailyActivity {
  date: string;
  count: number;
  dayName: string;
}

interface Stats {
  totalCards: number;
  dueToday: number;
  studiedToday: number;
  retentionRate: number;
  streakDays: number;
  newCards: number;
  learningCards: number;
  reviewCards: number;
}

export default function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { refreshSidebar } = useLayout();

  const [sources, setSources] = useState<Source[]>([]);
  const [dueCards, setDueCards] = useState<DueCardInfo[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalCards: 0,
    dueToday: 0,
    studiedToday: 0,
    retentionRate: 0,
    streakDays: 0,
    newCards: 0,
    learningCards: 0,
    reviewCards: 0,
  });
  const [weeklyActivity, setWeeklyActivity] = useState<DailyActivity[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  useBreadcrumb([{ label: "Dashboard" }]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
    }
  }, [user]);

  const fetchDashboardData = async () => {
    if (!user) return;
    // loading start

    try {
      const { data: sourcesData } = await supabase
        .from("sources")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setSources(sourcesData || []);

      const now = new Date().toISOString();
      const { data: dueReviews } = await supabase
        .from("reviews")
        .select(`
          id,
          due,
          state,
          flashcards!inner (
            id,
            chapter_id,
            chapters!inner (
              id,
              title,
              source_id,
              sources!inner (
                id,
                title,
                source_type
              )
            )
          )
        `)
        .eq("user_id", user.id)
        .lte("due", now);

      const dueByChapter: { [key: string]: DueCardInfo } = {};
      let newCards = 0;
      let learningCards = 0;
      let reviewCards = 0;

      if (dueReviews) {
        dueReviews.forEach((review: any) => {
          // Count by state
          if (review.state === 0) newCards++;
          else if (review.state === 1) learningCards++;
          else reviewCards++;

          const chapter = review.flashcards?.chapters;
          const source = chapter?.sources;
          if (chapter && source) {
            const key = chapter.id;
            if (!dueByChapter[key]) {
              dueByChapter[key] = {
                sourceId: source.id,
                sourceTitle: source.title,
                sourceType: source.source_type,
                chapterId: chapter.id,
                chapterTitle: chapter.title,
                dueCount: 0,
                estimatedMinutes: 0,
              };
            }
            dueByChapter[key].dueCount++;
            dueByChapter[key].estimatedMinutes = Math.ceil(dueByChapter[key].dueCount * 0.5);
          }
        });
      }

      const dueCardsList = Object.values(dueByChapter).sort((a, b) => b.dueCount - a.dueCount);
      setDueCards(dueCardsList);

      const totalDue = dueCardsList.reduce((acc, d) => acc + d.dueCount, 0);

      const { count: totalCards } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayReviews } = await supabase
        .from("reviews")
        .select("*")
        .eq("user_id", user.id)
        .gte("last_review", todayStart.toISOString());

      const studiedToday = todayReviews?.length || 0;

      const { count: masteredCards } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("state", 2);

      const retentionRate = totalCards && totalCards > 0
        ? Math.round((masteredCards || 0) / totalCards * 100)
        : 0;

      let streakDays = 0;
      const { data: recentReviews } = await supabase
        .from("reviews")
        .select("last_review")
        .eq("user_id", user.id)
        .not("last_review", "is", null)
        .order("last_review", { ascending: false })
        .limit(100);

      if (recentReviews && recentReviews.length > 0) {
        const reviewDates = new Set<string>();
        recentReviews.forEach((r: any) => {
          if (r.last_review) {
            reviewDates.add(new Date(r.last_review).toDateString());
          }
        });

        const today = new Date();
        let checkDate = new Date(today);

        if (!reviewDates.has(today.toDateString())) {
          checkDate.setDate(checkDate.getDate() - 1);
        }

        while (reviewDates.has(checkDate.toDateString())) {
          streakDays++;
          checkDate.setDate(checkDate.getDate() - 1);
        }
      }

      setStats({
        totalCards: totalCards || 0,
        dueToday: totalDue,
        studiedToday,
        retentionRate,
        streakDays,
        newCards,
        learningCards,
        reviewCards,
      });

      const last7Days: DailyActivity[] = [];
      const dayNames = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const { count } = await supabase
          .from("reviews")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .gte("last_review", date.toISOString())
          .lt("last_review", nextDate.toISOString());

        last7Days.push({
          date: date.toISOString(),
          count: count || 0,
          dayName: dayNames[date.getDay()],
        });
      }

      setWeeklyActivity(last7Days);

    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      // loading end
    }
  };

  const maxActivity = Math.max(...weeklyActivity.map(d => d.count), 1);
  const totalWeeklyCards = weeklyActivity.reduce((acc, d) => acc + d.count, 0);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  // Calculate daily goal progress
  const dailyGoal = 20; // Can be configurable
  const dailyProgress = Math.min(Math.round((stats.studiedToday / dailyGoal) * 100), 100);
  const estimatedTime = Math.ceil(stats.dueToday * 0.5);

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {getGreeting()}, {profile?.display_name || "Studente"}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            {stats.dueToday > 0
              ? `Hai ${stats.dueToday} carte da ripassare (~${estimatedTime} min)`
              : "Sei in pari con lo studio!"
            }
          </p>
        </div>

        <button
          data-tutorial="dashboard-add"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-white text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nuovo Materiale
        </button>
      </div>

      {/* Stats Row — flat cards, large numbers, icon right */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Da Ripassare", value: stats.dueToday, icon: "📚", color: "text-amber-400" },
          { label: "Studiate Oggi", value: stats.studiedToday, icon: "✅", color: "text-emerald-400" },
          { label: "Ritenzione", value: `${stats.retentionRate}%`, icon: "🧠", color: "text-purple-400" },
          { label: "Giorni Streak", value: stats.streakDays, icon: "🔥", color: "text-rose-400" },
        ].map(s => (
          <div key={s.label} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">{s.label}</span>
              <span className="text-xl">{s.icon}</span>
            </div>
            <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Two Column Layout */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">

        {/* Left Column */}
        <div className="lg:col-span-2 space-y-6">

          {/* Today's Progress */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">Progresso Giornaliero</h3>
              {stats.dueToday > 0 && (
                <Link
                  href="/dashboard/study"
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  Inizia Studio
                </Link>
              )}
            </div>

            {/* Progress bar instead of circular */}
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-400">Obiettivo giornaliero</span>
                  <span className="text-white font-medium">{stats.studiedToday}/{dailyGoal}</span>
                </div>
                <div className="h-3 bg-slate-700/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-700"
                    style={{ width: `${dailyProgress}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="text-center p-3 bg-slate-900/50 rounded-xl">
                  <p className="text-lg font-bold text-cyan-400">{stats.newCards}</p>
                  <p className="text-slate-500 text-xs mt-0.5">Nuove</p>
                </div>
                <div className="text-center p-3 bg-slate-900/50 rounded-xl">
                  <p className="text-lg font-bold text-purple-400">{stats.learningCards}</p>
                  <p className="text-slate-500 text-xs mt-0.5">In apprendimento</p>
                </div>
                <div className="text-center p-3 bg-slate-900/50 rounded-xl">
                  <p className="text-lg font-bold text-amber-400">{stats.reviewCards}</p>
                  <p className="text-slate-500 text-xs mt-0.5">Da ripassare</p>
                </div>
              </div>
            </div>
          </div>

          {/* Weekly Activity */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">Attivita Settimanale</h3>
              <span className="text-sm text-slate-400">{totalWeeklyCards} carte studiate</span>
            </div>

            <div className="flex items-end justify-between gap-2 h-28">
              {weeklyActivity.map((day, i) => {
                const isToday = i === weeklyActivity.length - 1;
                const h = maxActivity > 0 ? (day.count / maxActivity) * 100 : 0;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    {day.count > 0 && (
                      <span className="text-xs text-slate-500">{day.count}</span>
                    )}
                    <div
                      className="w-full max-w-[36px] rounded-md transition-all"
                      style={{
                        height: `${Math.max(h, day.count > 0 ? 20 : 6)}%`,
                        backgroundColor: day.count > 0
                          ? isToday ? '#a855f7' : '#6366f1'
                          : 'rgba(255,255,255,0.05)',
                      }}
                    />
                    <span className={`text-xs ${isToday ? 'text-purple-400 font-medium' : 'text-slate-600'}`}>
                      {day.dayName}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">

          {/* Due Cards */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-white font-semibold mb-4">Da Completare</h3>

            {dueCards.length > 0 ? (
              <div className="space-y-2">
                {dueCards.slice(0, 5).map((card) => (
                  <Link
                    key={card.chapterId}
                    href={`/dashboard/study?chapter=${card.chapterId}`}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-700/40 transition-colors group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-slate-700/50 flex items-center justify-center shrink-0">
                      <span className="text-sm">📖</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 font-medium truncate">{card.chapterTitle}</p>
                      <p className="text-xs text-slate-500 truncate">{card.sourceTitle}</p>
                    </div>
                    <span className="text-amber-400 text-sm font-bold shrink-0">{card.dueCount}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-slate-500 text-sm">Nessuna carta in scadenza</p>
              </div>
            )}
          </div>

          {/* Statistiche */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-white font-semibold mb-4">Statistiche</h3>
            <div className="space-y-3">
              {[
                { label: "Totale Flashcard", value: stats.totalCards },
                { label: "Libri/Materiali", value: sources.length },
                { label: "Tempo Stimato", value: `${estimatedTime} min` },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
                  <span className="text-slate-400 text-sm">{row.label}</span>
                  <span className="text-white font-semibold text-sm">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Your Materials Preview */}
          {sources.length > 0 && (
            <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-6">
              <h3 className="text-white font-semibold mb-4">I Tuoi Materiali</h3>
              <div className="space-y-2">
                {sources.slice(0, 3).map((source) => (
                  <Link
                    key={source.id}
                    href={`/dashboard/source/${source.id}`}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/40 transition-colors group"
                  >
                    <span className="text-lg">{getSourceIcon(source.source_type)}</span>
                    <span className="text-sm text-slate-300 group-hover:text-white transition-colors truncate">
                      {source.title}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Source Modal */}
      <AddSourceModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => { fetchDashboardData(); refreshSidebar(); }}
      />
    </div>
  );
}

// Helper functions
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

function getSourceIcon(type: string): string {
  switch (type) {
    case "book": return "📘";
    case "pdf": return "📄";
    case "notes": return "📝";
    default: return "📖";
  }
}

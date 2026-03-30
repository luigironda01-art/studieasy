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

// Circular Progress Component with glow
function CircularProgress({
  percentage,
  size = 180,
  label,
  sublabel
}: {
  percentage: number;
  size?: number;
  label?: string;
  sublabel?: string;
}) {
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Glow effect */}
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-30"
          style={{
            background: `conic-gradient(from 0deg, #06b6d4, #a855f7, #f97316, #06b6d4)`
          }}
        />
        <svg width={size} height={size} className="transform -rotate-90 relative z-10">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle with gradient */}
          <defs>
            <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="50%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#f97316" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#progressGradient)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
            style={{
              filter: 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.5))'
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <span className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-orange-400 bg-clip-text text-transparent">
            {percentage}%
          </span>
          {label && <span className="text-slate-400 text-sm mt-1">{label}</span>}
        </div>
      </div>
      {sublabel && <span className="text-slate-500 text-xs mt-3">{sublabel}</span>}
    </div>
  );
}

// Card with gradient border
function GradientCard({ children, className = "", glow = false }: { children: React.ReactNode; className?: string; glow?: boolean }) {
  return (
    <div className={`relative group ${className}`}>
      {/* Gradient border */}
      <div className={`absolute -inset-[1px] bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-2xl ${glow ? 'opacity-60' : 'opacity-30'} group-hover:opacity-60 blur-sm transition-opacity duration-300`} />
      <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-2xl opacity-20" />
      {/* Card content */}
      <div className="relative bg-[#0d1525]/95 backdrop-blur-xl rounded-2xl h-full">
        {children}
      </div>
    </div>
  );
}

// Stat Card Component with Tooltip
function StatCard({
  value,
  label,
  icon,
  tooltip,
  trend,
  color = "cyan",
  tooltipAlign = "center"
}: {
  value: number | string;
  label: string;
  icon: string;
  tooltip: string;
  trend?: number;
  color?: "cyan" | "purple" | "orange" | "green" | "pink";
  tooltipAlign?: "left" | "center" | "right";
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  const colors = {
    cyan: "from-cyan-500 to-cyan-600",
    purple: "from-purple-500 to-purple-600",
    orange: "from-orange-500 to-orange-600",
    green: "from-emerald-500 to-emerald-600",
    pink: "from-pink-500 to-pink-600"
  };

  const tooltipPositionClasses = {
    left: "left-0",
    center: "left-1/2 -translate-x-1/2",
    right: "right-0"
  };

  const arrowPositionClasses = {
    left: "left-4",
    center: "left-1/2 -translate-x-1/2",
    right: "right-4"
  };

  return (
    <div
      className="relative group"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Tooltip */}
      <div
        className={`absolute -top-2 ${tooltipPositionClasses[tooltipAlign]} -translate-y-full z-50 transition-all duration-200 ${
          showTooltip ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
      >
        <div className="bg-[#1e293b] border border-white/10 rounded-lg px-3 py-2.5 shadow-xl w-64 max-w-[90vw]">
          <p className="text-xs text-slate-200 leading-relaxed whitespace-normal">{tooltip}</p>
          {/* Arrow */}
          <div className={`absolute ${arrowPositionClasses[tooltipAlign]} -bottom-1.5 w-3 h-3 bg-[#1e293b] border-r border-b border-white/10 rotate-45`} />
        </div>
      </div>

      <div className={`absolute -inset-[1px] bg-gradient-to-r ${colors[color]} rounded-xl opacity-20 group-hover:opacity-40 transition-opacity`} />
      <div className="relative bg-[#0d1525]/80 backdrop-blur-sm rounded-xl p-4 border border-white/5 cursor-help">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-3xl font-bold text-white">{value}</p>
            <p className="text-sm text-slate-400 mt-1">{label}</p>
          </div>
          <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colors[color]} flex items-center justify-center opacity-80`}>
            <span className="text-lg">{icon}</span>
          </div>
        </div>
        {trend !== undefined && (
          <div className={`mt-2 text-xs ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}% vs ieri
          </div>
        )}
      </div>
    </div>
  );
}

// Progress Bar Component
function ProgressBar({
  value,
  max,
  label,
  color = "cyan"
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
}) {
  const percentage = max > 0 ? Math.round((value / max) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-400">{value}/{max}</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-${color}-500 to-${color}-400`}
          style={{
            width: `${percentage}%`,
            background: color === "cyan"
              ? 'linear-gradient(to right, #06b6d4, #22d3ee)'
              : color === "purple"
              ? 'linear-gradient(to right, #a855f7, #c084fc)'
              : 'linear-gradient(to right, #f97316, #fb923c)'
          }}
        />
      </div>
    </div>
  );
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
  const [isLoading, setIsLoading] = useState(true);

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
    setIsLoading(true);

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
      setIsLoading(false);
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
    <div className="min-h-screen bg-[#080c14] relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-purple-900/20 rounded-full blur-[150px]" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-cyan-900/15 rounded-full blur-[150px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-900/10 rounded-full blur-[200px]" />

      <div className="relative z-10 p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">
              {getGreeting()}, {profile?.display_name || "Studente"}
            </h1>
            <p className="text-slate-400 mt-1">
              {stats.dueToday > 0
                ? `Hai ${stats.dueToday} carte da ripassare (~${estimatedTime} min)`
                : "Sei in pari con lo studio! 🎉"
              }
            </p>
          </div>

          <button
            data-tutorial="dashboard-add"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full text-white font-medium shadow-lg shadow-pink-500/25 hover:shadow-pink-500/40 hover:scale-105 transition-all duration-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nuovo Materiale
          </button>
        </div>

        {/* Main Stats Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            value={stats.dueToday}
            label="Da Ripassare"
            icon="📚"
            color="orange"
            tooltip="Carte in scadenza oggi. L'algoritmo FSRS calcola il momento migliore per ripassare ogni carta, massimizzando la memorizzazione."
            tooltipAlign="left"
          />
          <StatCard
            value={stats.studiedToday}
            label="Studiate Oggi"
            icon="✅"
            color="green"
            tooltip="Numero di carte che hai ripassato oggi. Include nuove carte apprese e revisioni di carte già studiate."
          />
          <StatCard
            value={`${stats.retentionRate}%`}
            label="Ritenzione"
            icon="🧠"
            color="purple"
            tooltip="Percentuale di carte memorizzate stabilmente. Indica quante carte hai padroneggiato rispetto al totale. Obiettivo: sopra l'80%."
          />
          <StatCard
            value={stats.streakDays}
            label="Giorni Streak"
            icon="🔥"
            color="pink"
            tooltip="Giorni consecutivi in cui hai studiato. La costanza quotidiana è fondamentale per una memoria duratura!"
            tooltipAlign="right"
          />
        </div>

        {/* Two Column Layout */}
        <div className="grid lg:grid-cols-3 gap-6 mb-6">

          {/* Left Column - Progress Overview */}
          <div className="lg:col-span-2 space-y-6">

            {/* Today's Progress Card */}
            <GradientCard glow={stats.dueToday > 0}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-white">Progresso Giornaliero</h3>
                  {stats.dueToday > 0 && (
                    <Link
                      href="/dashboard/study"
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-lg text-white text-sm font-medium hover:opacity-90 transition-opacity"
                    >
                      <span>▶</span> Inizia Studio
                    </Link>
                  )}
                </div>

                <div className="grid md:grid-cols-2 gap-8 items-center">
                  {/* Circular Progress */}
                  <div className="flex justify-center">
                    <CircularProgress
                      percentage={dailyProgress}
                      label="Obiettivo Giornaliero"
                      sublabel={`${stats.studiedToday}/${dailyGoal} carte`}
                    />
                  </div>

                  {/* Card Type Breakdown */}
                  <div className="space-y-4">
                    <ProgressBar
                      value={stats.newCards}
                      max={stats.dueToday || 1}
                      label="🆕 Nuove"
                      color="cyan"
                    />
                    <ProgressBar
                      value={stats.learningCards}
                      max={stats.dueToday || 1}
                      label="📖 In Apprendimento"
                      color="purple"
                    />
                    <ProgressBar
                      value={stats.reviewCards}
                      max={stats.dueToday || 1}
                      label="🔄 Da Ripassare"
                      color="orange"
                    />

                    {stats.dueToday === 0 && (
                      <div className="text-center py-4">
                        <span className="text-4xl">🎯</span>
                        <p className="text-slate-400 mt-2">Nessuna carta in scadenza!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </GradientCard>

            {/* Weekly Activity */}
            <GradientCard>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold text-white">Attività Settimanale</h3>
                  <span className="text-sm text-cyan-400 font-medium">
                    {totalWeeklyCards} carte studiate
                  </span>
                </div>

                <div className="flex items-end justify-between gap-3 h-32">
                  {weeklyActivity.map((day, i) => {
                    const isToday = i === weeklyActivity.length - 1;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-2">
                        <div className="relative w-full flex flex-col items-center">
                          {day.count > 0 && (
                            <span className="text-xs text-slate-400 mb-1">{day.count}</span>
                          )}
                          <div
                            className={`w-full max-w-[40px] rounded-lg transition-all duration-500 ${isToday ? 'ring-2 ring-cyan-400/50' : ''}`}
                            style={{
                              height: `${Math.max((day.count / maxActivity) * 80, day.count > 0 ? 24 : 8)}px`,
                              background: day.count > 0
                                ? 'linear-gradient(to top, #06b6d4, #a855f7)'
                                : 'rgba(255,255,255,0.08)',
                              boxShadow: day.count > 0 ? '0 0 20px rgba(6,182,212,0.3)' : 'none'
                            }}
                          />
                        </div>
                        <span className={`text-xs ${isToday ? 'text-cyan-400 font-medium' : 'text-slate-500'}`}>
                          {day.dayName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </GradientCard>
          </div>

          {/* Right Column - What Needs Attention */}
          <div className="space-y-6">

            {/* Due Cards by Source */}
            <GradientCard>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Da Completare</h3>

                {dueCards.length > 0 ? (
                  <div className="space-y-3">
                    {dueCards.slice(0, 5).map((card) => (
                      <Link
                        key={card.chapterId}
                        href={`/dashboard/study?chapter=${card.chapterId}`}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-cyan-500/30 transition-all group"
                      >
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center">
                          <span className="text-lg">📖</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white font-medium truncate group-hover:text-cyan-400 transition-colors">
                            {card.chapterTitle}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{card.sourceTitle}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-orange-400">{card.dueCount}</p>
                          <p className="text-xs text-slate-500">carte</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <span className="text-4xl">✨</span>
                    <p className="text-slate-400 mt-3">Tutto in ordine!</p>
                    <p className="text-slate-500 text-sm">Nessuna carta in scadenza</p>
                  </div>
                )}
              </div>
            </GradientCard>

            {/* Quick Stats Cards */}
            <GradientCard>
              <div className="p-6">
                <h3 className="text-lg font-semibold text-white mb-4">Statistiche</h3>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <span className="text-slate-400">Totale Flashcard</span>
                    <span className="text-white font-semibold">{stats.totalCards}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <span className="text-slate-400">Libri/Materiali</span>
                    <span className="text-white font-semibold">{sources.length}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                    <span className="text-slate-400">Tempo Stimato</span>
                    <span className="text-white font-semibold">{estimatedTime} min</span>
                  </div>
                </div>
              </div>
            </GradientCard>

            {/* Your Materials Preview */}
            {sources.length > 0 && (
              <GradientCard>
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">I Tuoi Materiali</h3>
                    <Link href="/dashboard/sources" className="text-cyan-400 text-sm hover:text-cyan-300">
                      Vedi tutti →
                    </Link>
                  </div>

                  <div className="space-y-2">
                    {sources.slice(0, 3).map((source) => (
                      <Link
                        key={source.id}
                        href={`/dashboard/source/${source.id}`}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors group"
                      >
                        <span className="text-lg">{getSourceIcon(source.source_type)}</span>
                        <span className="text-sm text-slate-300 group-hover:text-white transition-colors truncate">
                          {source.title}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </GradientCard>
            )}
          </div>
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

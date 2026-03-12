"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
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
}

// Circular Progress Component
function CircularProgress({ percentage, size = 160 }: { percentage: number; size?: number }) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle with gradient */}
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00d4ff" />
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
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-3xl font-bold bg-gradient-to-r from-cyan-400 to-orange-400 bg-clip-text text-transparent">
          {percentage}%
        </span>
      </div>
    </div>
  );
}

// Card with gradient border
function GradientCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative group ${className}`}>
      {/* Gradient border */}
      <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-2xl opacity-50 group-hover:opacity-100 blur-sm transition-opacity duration-300" />
      <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-2xl opacity-30" />
      {/* Card content */}
      <div className="relative bg-[#0d1525]/90 backdrop-blur-xl rounded-2xl">
        {children}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [sources, setSources] = useState<Source[]>([]);
  const [dueCards, setDueCards] = useState<DueCardInfo[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalCards: 0,
    dueToday: 0,
    studiedToday: 0,
    retentionRate: 0,
    streakDays: 0,
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

      if (dueReviews) {
        dueReviews.forEach((review: any) => {
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

  const getSourceIcon = (type: string) => {
    switch (type) {
      case "book": return "📘";
      case "pdf": return "📄";
      case "notes": return "📝";
      default: return "📖";
    }
  };

  const maxActivity = Math.max(...weeklyActivity.map(d => d.count), 1);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#080c14] flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  const progressPercentage = stats.totalCards > 0
    ? Math.round((stats.studiedToday / Math.max(stats.dueToday + stats.studiedToday, 1)) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-[#080c14] relative overflow-hidden">
      {/* Mesh/Wireframe decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 opacity-20">
        <div className="w-full h-full border border-cyan-500/30 rounded-full"
             style={{
               background: 'radial-gradient(circle, transparent 60%, rgba(0,212,255,0.1) 100%)',
               boxShadow: '0 0 60px rgba(0,212,255,0.2)'
             }} />
      </div>
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] opacity-20">
        <div className="w-full h-full border border-emerald-500/30 rounded-full"
             style={{
               background: 'radial-gradient(circle, transparent 60%, rgba(16,185,129,0.1) 100%)',
               boxShadow: '0 0 60px rgba(16,185,129,0.2)'
             }} />
      </div>

      {/* Purple glow in center */}
      <div className="absolute top-1/3 left-1/4 w-[600px] h-[600px] bg-purple-900/20 rounded-full blur-[120px]" />

      <div className="relative z-10 p-6 lg:p-8">
        {/* Header with Upload Button */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Ciao, {profile?.display_name || "Studente"}
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              {stats.dueToday > 0 ? `${stats.dueToday} carte da studiare` : "Tutto in pari!"}
            </p>
          </div>

          {/* Upload Button - Pink/Magenta gradient */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full text-white font-medium shadow-lg shadow-pink-500/30 hover:shadow-pink-500/50 hover:scale-105 transition-all duration-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            UPLOAD NEW FILE
          </button>
        </div>

        {/* Main Grid Layout */}
        <div className="grid lg:grid-cols-12 gap-6">

          {/* Left Sidebar - Recent Uploads */}
          <div className="lg:col-span-2">
            <GradientCard>
              <div className="p-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                  RECENT UPLOADS
                </h3>
                <nav className="space-y-1">
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-white/5 transition-colors text-left text-sm">
                    <span className="text-cyan-400">📁</span>
                    Upload Files
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-white/5 transition-colors text-left text-sm">
                    <span className="text-cyan-400">✓</span>
                    My Flashcards
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-white/5 transition-colors text-left text-sm">
                    <span className="text-cyan-400">📝</span>
                    Summaries
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-cyan-500/50 text-cyan-400 text-left text-sm">
                    <span>📊</span>
                    Infographics
                  </button>
                </nav>
              </div>
            </GradientCard>
          </div>

          {/* Center - Generated Assets */}
          <div className="lg:col-span-6">
            <GradientCard className="h-full">
              <div className="p-6">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">
                  GENERATED ASSETS
                </h3>

                {/* Flashcard Preview */}
                {dueCards.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="text-white font-medium">
                        Flashcard: {dueCards[0]?.chapterTitle || "In attesa"}
                      </span>
                    </div>

                    {/* Card Preview Area */}
                    <div className="relative h-48 bg-gradient-to-br from-[#0a1628] to-[#0d1f35] rounded-xl border border-white/10 flex items-center justify-center overflow-hidden">
                      {/* Glow effect */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-32 h-32 bg-cyan-500/20 rounded-full blur-3xl" />
                      </div>
                      <div className="relative z-10 text-center">
                        <div className="w-16 h-16 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 border border-white/10">
                          <span className="text-3xl">🧠</span>
                        </div>
                        <p className="text-slate-400 text-sm">{stats.dueToday} carte pronte</p>
                      </div>
                    </div>

                    {/* File List */}
                    <div className="space-y-2 mt-6">
                      {sources.slice(0, 3).map((source, i) => (
                        <Link
                          key={source.id}
                          href={`/dashboard/source/${source.id}`}
                          className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
                        >
                          <div className="w-2 h-2 rounded-full bg-cyan-400" />
                          <span className="text-slate-300 text-sm flex-1 truncate group-hover:text-white transition-colors">
                            {source.title}
                          </span>
                          <span className="text-slate-500 text-xs">{'<-->'}</span>
                        </Link>
                      ))}
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-6">
                      <div className="flex justify-between text-xs text-slate-500 mb-2">
                        <span>2.0m</span>
                        <span>2.5ps</span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 rounded-full transition-all duration-500"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-20 h-20 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-dashed border-white/20">
                        <span className="text-4xl">📚</span>
                      </div>
                      <p className="text-slate-400 mb-4">Nessun contenuto</p>
                      <button
                        onClick={() => setShowAddModal(true)}
                        className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors"
                      >
                        + Aggiungi il tuo primo libro
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </GradientCard>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-4 space-y-6">
            {/* Motor Section - Topic Cards */}
            <GradientCard>
              <div className="p-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                  I TUOI LIBRI
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {sources.slice(0, 4).map((source) => (
                    <Link
                      key={source.id}
                      href={`/dashboard/source/${source.id}`}
                      className="relative group overflow-hidden rounded-xl bg-gradient-to-br from-[#0a1628] to-[#0d1f35] border border-white/10 hover:border-cyan-500/50 transition-all duration-300"
                    >
                      <div className="p-4">
                        <div className="w-10 h-10 bg-gradient-to-br from-cyan-500/20 to-purple-500/20 rounded-lg flex items-center justify-center mb-3">
                          <span className="text-xl">{getSourceIcon(source.source_type)}</span>
                        </div>
                        <p className="text-white text-xs font-medium truncate">{source.title}</p>
                        {source.author && (
                          <p className="text-slate-500 text-xs truncate mt-0.5">{source.author}</p>
                        )}
                      </div>
                      {/* Hover glow */}
                      <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  ))}
                  {sources.length === 0 && (
                    <>
                      <div className="aspect-square rounded-xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center">
                        <span className="text-slate-500 text-2xl">+</span>
                      </div>
                      <div className="aspect-square rounded-xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center">
                        <span className="text-slate-500 text-2xl">+</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </GradientCard>

            {/* Study Progress */}
            <GradientCard>
              <div className="p-6">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-6">
                  STUDY PROGRESS
                </h3>
                <div className="flex justify-center">
                  <CircularProgress percentage={stats.retentionRate || progressPercentage} />
                </div>
                <div className="mt-6 grid grid-cols-2 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-white">{stats.studiedToday}</p>
                    <p className="text-xs text-slate-500">Studiate oggi</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-white">{stats.streakDays}</p>
                    <p className="text-xs text-slate-500">Giorni streak</p>
                  </div>
                </div>
              </div>
            </GradientCard>

            {/* Quick Study Button */}
            {stats.dueToday > 0 && (
              <Link href="/dashboard/study" className="block">
                <div className="relative group">
                  <div className="absolute -inset-[1px] bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 rounded-xl opacity-70 group-hover:opacity-100 blur-sm transition-opacity" />
                  <div className="relative bg-gradient-to-r from-cyan-600 to-purple-600 rounded-xl p-4 text-center">
                    <span className="text-white font-semibold">🎯 Inizia Studio → {stats.dueToday} carte</span>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>

        {/* Weekly Activity - Bottom */}
        <div className="mt-6">
          <GradientCard>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                  ATTIVITÀ SETTIMANALE
                </h3>
                <span className="text-cyan-400 text-sm">
                  {weeklyActivity.reduce((acc, d) => acc + d.count, 0)} carte questa settimana
                </span>
              </div>
              <div className="flex items-end justify-between gap-2 h-20">
                {weeklyActivity.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full rounded-t-lg transition-all duration-300"
                      style={{
                        height: `${Math.max((day.count / maxActivity) * 100, day.count > 0 ? 20 : 8)}%`,
                        minHeight: day.count > 0 ? "20%" : "8%",
                        background: day.count > 0
                          ? 'linear-gradient(to top, #06b6d4, #a855f7)'
                          : 'rgba(255,255,255,0.1)',
                        boxShadow: day.count > 0 ? '0 0 20px rgba(6,182,212,0.3)' : 'none'
                      }}
                    />
                    <span className="text-slate-500 text-xs">{day.dayName}</span>
                  </div>
                ))}
              </div>
            </div>
          </GradientCard>
        </div>
      </div>

      {/* Add Source Modal */}
      <AddSourceModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={fetchDashboardData}
      />
    </div>
  );
}

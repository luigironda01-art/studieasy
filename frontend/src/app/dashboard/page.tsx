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
      // Fetch sources
      const { data: sourcesData } = await supabase
        .from("sources")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setSources(sourcesData || []);

      // Fetch due reviews with flashcard and chapter info
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

      // Group due cards by chapter
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

      // Calculate stats
      const totalDue = dueCardsList.reduce((acc, d) => acc + d.dueCount, 0);

      // Get total cards
      const { count: totalCards } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      // Get today's reviews (studied today)
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayReviews } = await supabase
        .from("reviews")
        .select("*")
        .eq("user_id", user.id)
        .gte("last_review", todayStart.toISOString());

      const studiedToday = todayReviews?.length || 0;

      // Calculate retention (cards with state >= 2 / total)
      const { count: masteredCards } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("state", 2);

      const retentionRate = totalCards && totalCards > 0
        ? Math.round((masteredCards || 0) / totalCards * 100)
        : 0;

      // Calculate streak (simplified - check consecutive days with reviews)
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

        // If no study today, start from yesterday
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

      // Calculate weekly activity
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

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Buongiorno";
    if (hour < 18) return "Buon pomeriggio";
    return "Buonasera";
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
      <div className="min-h-screen bg-[#020617] relative overflow-hidden flex items-center justify-center">
        {/* Aurora Background */}
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-purple-900/30 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-blue-900/30 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s', animationDelay: '4s' }} />

        <div className="relative z-10 text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-slate-400">Caricamento...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const totalDueMinutes = dueCards.reduce((acc, d) => acc + d.estimatedMinutes, 0);

  return (
    <div className="min-h-screen bg-[#020617] relative overflow-hidden">
      {/* Aurora Background */}
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-purple-900/30 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-blue-900/30 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s', animationDelay: '4s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-900/10 rounded-full blur-3xl" />

      <div className="relative z-10 p-6 md:p-8">
        <div className="max-w-6xl mx-auto">
          {/* Welcome Header */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">
                {getGreeting()}, {profile?.display_name || "Studente"}!
              </h1>
              <p className="text-slate-400 mt-1">
                {stats.dueToday > 0
                  ? `Hai ${stats.dueToday} carte da studiare oggi`
                  : "Sei in pari con lo studio!"}
              </p>
            </div>
            {stats.streakDays > 0 && (
              <div className="flex items-center gap-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 backdrop-blur-md text-orange-400 px-4 py-2 rounded-xl border border-orange-500/30">
                <span className="text-2xl">🔥</span>
                <div>
                  <p className="font-bold text-lg">{stats.streakDays}</p>
                  <p className="text-xs text-orange-400/80">giorni</p>
                </div>
              </div>
            )}
          </div>

          {/* Hero CTA - Study Now */}
          {stats.dueToday > 0 && (
            <Link href="/dashboard/study" className="block mb-8">
              <div className="bg-gradient-to-br from-blue-600/90 to-purple-700/90 backdrop-blur-md rounded-2xl p-6 md:p-8 border border-white/10 hover:border-purple-500/50 transition-all duration-300 transform hover:scale-[1.01] hover:shadow-xl hover:shadow-purple-500/20 group">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-3xl">🎯</span>
                      <h2 className="text-xl md:text-2xl font-bold text-white">Inizia Sessione di Studio</h2>
                    </div>
                    <p className="text-blue-100/80">
                      {stats.dueToday} carte · ~{totalDueMinutes} minuti · {dueCards.length} {dueCards.length === 1 ? "capitolo" : "capitoli"}
                    </p>
                  </div>
                  <div className="hidden md:flex items-center justify-center w-16 h-16 bg-white/10 backdrop-blur-sm rounded-2xl group-hover:bg-white/20 transition-all duration-300">
                    <svg className="w-8 h-8 text-white group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mt-6">
                  <div className="flex justify-between text-sm text-blue-100/80 mb-2">
                    <span>Progresso giornaliero</span>
                    <span>{stats.studiedToday} studiate oggi</span>
                  </div>
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((stats.studiedToday / Math.max(stats.dueToday + stats.studiedToday, 1)) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </Link>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-4 md:p-5 hover:border-purple-500/50 transition-all duration-300 group">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600/30 to-blue-600/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <span className="text-xl">📚</span>
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-bold text-white">{stats.totalCards}</p>
              <p className="text-slate-400 text-sm">Carte totali</p>
            </div>

            <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-4 md:p-5 hover:border-purple-500/50 transition-all duration-300 group">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-600/30 to-purple-600/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <span className="text-xl">📅</span>
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-bold text-white">{stats.studiedToday}</p>
              <p className="text-slate-400 text-sm">Studiate oggi</p>
            </div>

            <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-4 md:p-5 hover:border-purple-500/50 transition-all duration-300 group">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-600/30 to-emerald-600/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <span className="text-xl">🎯</span>
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-bold text-white">{stats.retentionRate}%</p>
              <p className="text-slate-400 text-sm">Retention</p>
            </div>

            <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-4 md:p-5 hover:border-purple-500/50 transition-all duration-300 group">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-600/30 to-orange-600/10 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <span className="text-xl">🔥</span>
                </div>
              </div>
              <p className="text-2xl md:text-3xl font-bold text-white">{stats.streakDays}</p>
              <p className="text-slate-400 text-sm">Giorni streak</p>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Due Cards - Left Column (2/3) */}
            <div className="lg:col-span-2 space-y-6">
              {/* Due Cards by Chapter */}
              {dueCards.length > 0 && (
                <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-white/10">
                    <h3 className="font-semibold text-white">Da ripassare oggi</h3>
                    <Link href="/dashboard/study" className="text-purple-400 text-sm hover:text-purple-300 transition-colors">
                      Studia tutto →
                    </Link>
                  </div>
                  <div className="divide-y divide-white/5">
                    {dueCards.slice(0, 5).map((item) => (
                      <Link
                        key={item.chapterId}
                        href={`/dashboard/source/${item.sourceId}?chapter=${item.chapterId}`}
                        className="flex items-center gap-4 p-4 hover:bg-white/5 transition-all duration-300 group"
                      >
                        <div className="w-10 h-10 bg-white/5 backdrop-blur-sm rounded-xl flex items-center justify-center text-xl group-hover:scale-110 transition-transform duration-300">
                          {getSourceIcon(item.sourceType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate group-hover:text-purple-300 transition-colors">{item.sourceTitle}</p>
                          <p className="text-slate-400 text-sm truncate">{item.chapterTitle}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-purple-400 font-semibold">{item.dueCount} carte</p>
                          <p className="text-slate-500 text-xs">~{item.estimatedMinutes} min</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                  {dueCards.length > 5 && (
                    <div className="p-4 border-t border-white/10 text-center">
                      <Link href="/dashboard/study" className="text-slate-400 text-sm hover:text-purple-400 transition-colors">
                        +{dueCards.length - 5} altri capitoli
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* Books Grid */}
              <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                  <h3 className="font-semibold text-white">I tuoi libri</h3>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="text-purple-400 text-sm hover:text-purple-300 flex items-center gap-1 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Aggiungi
                  </button>
                </div>

                {isLoading ? (
                  <div className="p-8">
                    <div className="animate-pulse grid grid-cols-2 md:grid-cols-3 gap-4">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 bg-white/5 rounded-xl"></div>
                      ))}
                    </div>
                  </div>
                ) : sources.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 bg-white/5 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <span className="text-3xl">📖</span>
                    </div>
                    <h4 className="text-white font-medium mb-2">Nessun libro</h4>
                    <p className="text-slate-400 text-sm mb-4">
                      Aggiungi il tuo primo libro per iniziare
                    </p>
                    <button
                      onClick={() => setShowAddModal(true)}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300"
                    >
                      Aggiungi libro
                    </button>
                  </div>
                ) : (
                  <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                    {sources.map((source) => (
                      <Link
                        key={source.id}
                        href={`/dashboard/source/${source.id}`}
                        className="bg-white/5 backdrop-blur-sm rounded-xl p-4 hover:bg-white/10 hover:border-purple-500/50 border border-transparent transition-all duration-300 group"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-2xl group-hover:scale-110 transition-transform duration-300">{getSourceIcon(source.source_type)}</span>
                        </div>
                        <h4 className="text-white font-medium text-sm truncate group-hover:text-purple-300 transition-colors">
                          {source.title}
                        </h4>
                        {source.author && (
                          <p className="text-slate-500 text-xs truncate mt-0.5">{source.author}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column (1/3) */}
            <div className="space-y-6">
              {/* Weekly Activity */}
              <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-4">
                <h3 className="font-semibold text-white mb-4">Attività settimanale</h3>
                <div className="flex items-end justify-between gap-2 h-24">
                  {weeklyActivity.map((day, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <div
                        className={`w-full rounded-lg transition-all duration-300 ${
                          day.count > 0 ? "bg-gradient-to-t from-purple-600 to-cyan-400" : "bg-white/10"
                        }`}
                        style={{
                          height: `${Math.max((day.count / maxActivity) * 100, day.count > 0 ? 20 : 10)}%`,
                          minHeight: day.count > 0 ? "20%" : "10%",
                        }}
                        title={`${day.count} carte`}
                      />
                      <span className="text-slate-500 text-xs">{day.dayName}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-400">Totale settimana</span>
                    <span className="text-white font-medium">
                      {weeklyActivity.reduce((acc, d) => acc + d.count, 0)} carte
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-4">
                <h3 className="font-semibold text-white mb-4">Azioni rapide</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 hover:border-purple-500/50 border border-transparent transition-all duration-300 text-left group"
                  >
                    <span className="text-xl group-hover:scale-110 transition-transform duration-300">📚</span>
                    <span className="text-slate-300 text-sm">Aggiungi nuovo libro</span>
                  </button>
                  <Link
                    href="/stats"
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 hover:border-purple-500/50 border border-transparent transition-all duration-300 group"
                  >
                    <span className="text-xl group-hover:scale-110 transition-transform duration-300">📊</span>
                    <span className="text-slate-300 text-sm">Vedi statistiche</span>
                  </Link>
                  <Link
                    href="/settings"
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 hover:border-purple-500/50 border border-transparent transition-all duration-300 group"
                  >
                    <span className="text-xl group-hover:scale-110 transition-transform duration-300">⚙️</span>
                    <span className="text-slate-300 text-sm">Impostazioni</span>
                  </Link>
                </div>
              </div>

              {/* Motivation Card */}
              {stats.streakDays >= 7 && (
                <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/20 backdrop-blur-md rounded-2xl border border-amber-500/30 p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">🏆</span>
                    <h3 className="font-semibold text-amber-400">Grande lavoro!</h3>
                  </div>
                  <p className="text-amber-100/80 text-sm">
                    {stats.streakDays} giorni consecutivi di studio. Continua così!
                  </p>
                </div>
              )}
            </div>
          </div>
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

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase } from "@/lib/supabase";

interface StatsData {
  totalCards: number;
  totalReviews: number;
  cardsLearned: number;
  cardsLearning: number;
  cardsNew: number;
  averageRetention: number;
  streakDays: number;
  totalStudyDays: number;
  bestStreak: number;
}

interface DailyStats {
  date: string;
  count: number;
}

function StatsPageContent() {
  const { user } = useAuth();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [monthlyActivity, setMonthlyActivity] = useState<DailyStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useBreadcrumb([{ label: "Statistiche" }]);

  useEffect(() => {
    if (user) {
      fetchStats();
    }
  }, [user]);

  const fetchStats = async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      // Get total reviews count
      const { count: totalCards } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id);

      // Get cards by state
      const { count: cardsNew } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("state", 0);

      const { count: cardsLearning } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("state", 1);

      const { count: cardsLearned } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .gte("state", 2);

      // Get total reviews done
      const { count: totalReviews } = await supabase
        .from("reviews")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .not("last_review", "is", null);

      // Calculate retention
      const retention = totalCards && totalCards > 0
        ? Math.round(((cardsLearned || 0) / totalCards) * 100)
        : 0;

      // Get streak data
      const { data: reviewDates } = await supabase
        .from("reviews")
        .select("last_review")
        .eq("user_id", user.id)
        .not("last_review", "is", null)
        .order("last_review", { ascending: false });

      const uniqueDates = new Set<string>();
      reviewDates?.forEach((r: any) => {
        if (r.last_review) {
          uniqueDates.add(new Date(r.last_review).toDateString());
        }
      });

      const totalStudyDays = uniqueDates.size;

      // Calculate current streak
      let streakDays = 0;
      let bestStreak = 0;

      const sortedDates = Array.from(uniqueDates)
        .map(d => new Date(d))
        .sort((a, b) => b.getTime() - a.getTime());

      if (sortedDates.length > 0) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let checkDate = new Date(today);

        const firstDate = sortedDates[0];
        firstDate.setHours(0, 0, 0, 0);

        const diffDays = Math.floor((today.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays > 1) {
          streakDays = 0;
        } else {
          if (diffDays === 1) {
            checkDate.setDate(checkDate.getDate() - 1);
          }

          while (uniqueDates.has(checkDate.toDateString())) {
            streakDays++;
            checkDate.setDate(checkDate.getDate() - 1);
          }
        }

        // Calculate best streak
        let tempStreak = 1;
        for (let i = 1; i < sortedDates.length; i++) {
          const diff = Math.floor((sortedDates[i - 1].getTime() - sortedDates[i].getTime()) / (1000 * 60 * 60 * 24));
          if (diff === 1) {
            tempStreak++;
          } else {
            bestStreak = Math.max(bestStreak, tempStreak);
            tempStreak = 1;
          }
        }
        bestStreak = Math.max(bestStreak, tempStreak, streakDays);
      }

      setStats({
        totalCards: totalCards || 0,
        totalReviews: totalReviews || 0,
        cardsLearned: cardsLearned || 0,
        cardsLearning: cardsLearning || 0,
        cardsNew: cardsNew || 0,
        averageRetention: retention,
        streakDays,
        totalStudyDays,
        bestStreak,
      });

      // Get last 30 days activity
      const last30Days: DailyStats[] = [];
      for (let i = 29; i >= 0; i--) {
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

        last30Days.push({
          date: date.toISOString(),
          count: count || 0,
        });
      }

      setMonthlyActivity(last30Days);

    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const maxActivity = Math.max(...monthlyActivity.map(d => d.count), 1);

  if (isLoading || !stats) {
    return (
      <div className="p-6 md:p-8">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold text-white mb-8">Statistiche</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-slate-800 rounded-xl border border-slate-700 p-5 animate-pulse">
                <div className="h-8 bg-slate-700 rounded mb-2"></div>
                <div className="h-4 bg-slate-700 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Statistiche</h1>
        <p className="text-slate-400 mb-8">Monitora i tuoi progressi di studio</p>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">📚</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{stats.totalCards}</p>
            <p className="text-slate-400 text-sm">Carte totali</p>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">✅</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-green-400">{stats.cardsLearned}</p>
            <p className="text-slate-400 text-sm">Apprese</p>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">📖</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-yellow-400">{stats.cardsLearning}</p>
            <p className="text-slate-400 text-sm">In apprendimento</p>
          </div>

          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <span className="text-xl">🆕</span>
              </div>
            </div>
            <p className="text-3xl font-bold text-purple-400">{stats.cardsNew}</p>
            <p className="text-slate-400 text-sm">Nuove</p>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Streak Card */}
          <div className="bg-gradient-to-br from-orange-500/20 to-red-500/20 rounded-xl border border-orange-500/30 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Streak</h3>
              <span className="text-4xl">🔥</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-3xl font-bold text-orange-400">{stats.streakDays}</p>
                <p className="text-orange-200/60 text-sm">Giorni attuali</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-orange-400">{stats.bestStreak}</p>
                <p className="text-orange-200/60 text-sm">Record</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-orange-400">{stats.totalStudyDays}</p>
                <p className="text-orange-200/60 text-sm">Giorni totali</p>
              </div>
            </div>
          </div>

          {/* Retention Card */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Performance</h3>
              <span className="text-4xl">🎯</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className={`text-3xl font-bold ${stats.averageRetention >= 70 ? "text-green-400" : stats.averageRetention >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                  {stats.averageRetention}%
                </p>
                <p className="text-slate-400 text-sm">Retention</p>
              </div>
              <div>
                <p className="text-3xl font-bold text-blue-400">{stats.totalReviews}</p>
                <p className="text-slate-400 text-sm">Revisioni totali</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    stats.averageRetention >= 70 ? "bg-green-500" :
                    stats.averageRetention >= 50 ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${stats.averageRetention}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Activity */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Attività ultimi 30 giorni</h3>
          <div className="flex items-end gap-1 h-32">
            {monthlyActivity.map((day, i) => (
              <div key={i} className="flex-1 group relative">
                <div
                  className={`w-full rounded-t transition-all duration-300 ${
                    day.count > 0 ? "bg-gradient-to-t from-blue-600 to-purple-500" : "bg-slate-700"
                  }`}
                  style={{ height: `${Math.max((day.count / maxActivity) * 100, day.count > 0 ? 15 : 5)}%` }}
                />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  <div className="bg-slate-700 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    {new Date(day.date).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}: {day.count}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4 text-xs text-slate-500">
            <span>30 giorni fa</span>
            <span>Oggi</span>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between">
            <span className="text-slate-400">Totale periodo</span>
            <span className="text-white font-medium">
              {monthlyActivity.reduce((acc, d) => acc + d.count, 0)} carte
            </span>
          </div>
        </div>

        {/* Cards Distribution */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mt-6">
          <h3 className="text-lg font-semibold text-white mb-4">Distribuzione carte</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Apprese</span>
                <span className="text-green-400">{stats.cardsLearned}</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${stats.totalCards > 0 ? (stats.cardsLearned / stats.totalCards) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">In apprendimento</span>
                <span className="text-yellow-400">{stats.cardsLearning}</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${stats.totalCards > 0 ? (stats.cardsLearning / stats.totalCards) * 100 : 0}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Nuove</span>
                <span className="text-purple-400">{stats.cardsNew}</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: `${stats.totalCards > 0 ? (stats.cardsNew / stats.totalCards) * 100 : 0}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StatsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading || !user) {
    return null;
  }

  return (
    <AppLayout>
      <StatsPageContent />
    </AppLayout>
  );
}

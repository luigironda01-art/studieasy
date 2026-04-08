"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { authFetch } from "@/lib/api-client";
import OverviewTab from "./components/OverviewTab";
import UsersTab from "./components/UsersTab";
import ContentTab from "./components/ContentTab";
import UsageTab from "./components/UsageTab";

type TabId = "overview" | "users" | "content" | "usage";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "users", label: "Utenti", icon: "👥" },
  { id: "content", label: "Contenuti", icon: "📚" },
  { id: "usage", label: "AI Usage", icon: "⚡" },
];

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useBreadcrumb([{ label: "Admin" }]);

  const checkAdmin = useCallback(async () => {
    if (!user) return;
    try {
      const res = await authFetch("/api/admin/check");
      const data = await res.json();
      setIsAdmin(!!data.isAdmin);
    } catch {
      setIsAdmin(false);
    } finally {
      setChecking(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) checkAdmin();
  }, [user, authLoading, router, checkAdmin]);

  if (authLoading || checking) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-5xl">🔒</span>
        <h1 className="text-white text-xl font-semibold">Accesso negato</h1>
        <p className="text-slate-400 text-sm">Questa sezione è riservata agli amministratori.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Monitora utenti, contenuti e utilizzo AI della piattaforma
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-xs font-medium">Admin attivo</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-white/10">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all relative ${
              activeTab === tab.id
                ? "text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "users" && <UsersTab />}
        {activeTab === "content" && <ContentTab />}
        {activeTab === "usage" && <UsageTab />}
      </div>
    </div>
  );
}

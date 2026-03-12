"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";

function SettingsPageContent() {
  const { user, profile } = useAuth();

  useBreadcrumb([{ label: "Impostazioni" }]);

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-8">Impostazioni</h1>

        {/* Profile section */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Profilo</h2>
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-2xl font-bold">
                {profile?.display_name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-white font-medium">{profile?.display_name || "Utente"}</p>
              <p className="text-slate-400 text-sm">{user?.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-400 text-sm mb-2">Nome visualizzato</label>
              <input
                type="text"
                defaultValue={profile?.display_name || ""}
                placeholder="Il tuo nome"
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Preferences section */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Preferenze</h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white">Tema</p>
                <p className="text-slate-400 text-sm">Scegli il tema dell&apos;app</p>
              </div>
              <div className="flex items-center gap-1 bg-slate-700 rounded-lg p-1">
                <button className="p-2 rounded text-slate-400 hover:text-white hover:bg-slate-600 transition-colors">
                  ☀️
                </button>
                <button className="p-2 rounded bg-slate-600 text-white">
                  🌙
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-white">Lingua</p>
                <p className="text-slate-400 text-sm">Lingua dell&apos;interfaccia</p>
              </div>
              <select className="px-4 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="it">Italiano</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-white">Notifiche</p>
                <p className="text-slate-400 text-sm">Ricevi promemoria di studio</p>
              </div>
              <button className="w-12 h-6 bg-slate-600 rounded-full relative transition-colors">
                <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform" />
              </button>
            </div>
          </div>
        </div>

        {/* Danger zone */}
        <div className="bg-slate-800 rounded-xl border border-red-500/30 p-6">
          <h2 className="text-lg font-semibold text-red-400 mb-4">Zona pericolosa</h2>
          <p className="text-slate-400 text-sm mb-4">
            Queste azioni sono irreversibili. Procedi con cautela.
          </p>
          <button className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg font-medium hover:bg-red-500/30 transition-colors">
            Elimina account
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
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
      <SettingsPageContent />
    </AppLayout>
  );
}

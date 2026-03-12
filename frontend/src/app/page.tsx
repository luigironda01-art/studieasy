"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">S</span>
          </div>
          <span className="text-white font-semibold text-xl">Backup Buddy</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-slate-300 hover:text-white transition-colors px-4 py-2"
          >
            Accedi
          </Link>
          <Link
            href="/signup"
            className="bg-white text-slate-900 px-5 py-2.5 rounded-full font-medium hover:bg-slate-100 transition-colors"
          >
            Inizia gratis
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-6 pt-20 pb-32 text-center">
        <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
          Il tuo assistente
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            di studio AI
          </span>
        </h1>

        <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto leading-relaxed">
          Carica libri, PDF e appunti. L&apos;AI crea flashcard intelligenti
          e ti aiuta a memorizzare con la ripetizione spaziata.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold text-lg hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/25"
          >
            Prova Backup Buddy gratis →
          </Link>
        </div>

        {/* Visual Preview */}
        <div className="mt-20 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent z-10 pointer-events-none"></div>
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 shadow-2xl">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Source Card */}
              <div className="bg-slate-700/50 rounded-xl p-6 text-left">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4">
                  <span className="text-2xl">📚</span>
                </div>
                <h3 className="text-white font-semibold mb-2">Carica le fonti</h3>
                <p className="text-slate-400 text-sm">
                  PDF, foto di libri, appunti scritti a mano
                </p>
              </div>

              {/* AI Card */}
              <div className="bg-slate-700/50 rounded-xl p-6 text-left">
                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4">
                  <span className="text-2xl">✨</span>
                </div>
                <h3 className="text-white font-semibold mb-2">AI genera contenuti</h3>
                <p className="text-slate-400 text-sm">
                  Flashcard, quiz, riassunti automatici
                </p>
              </div>

              {/* Study Card */}
              <div className="bg-slate-700/50 rounded-xl p-6 text-left">
                <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center mb-4">
                  <span className="text-2xl">🧠</span>
                </div>
                <h3 className="text-white font-semibold mb-2">Studia efficace</h3>
                <p className="text-slate-400 text-sm">
                  Ripetizione spaziata scientifica (FSRS)
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-white text-center mb-16">
          Perché Backup Buddy?
        </h2>

        <div className="grid md:grid-cols-2 gap-8">
          <FeatureItem
            icon="⚡"
            title="Risparmia ore di lavoro"
            description="Niente più tempo perso a creare flashcard manualmente. L'AI lo fa per te in secondi."
          />
          <FeatureItem
            icon="🎯"
            title="Memorizzazione scientifica"
            description="L'algoritmo FSRS ti fa ripassare al momento perfetto per ricordare a lungo termine."
          />
          <FeatureItem
            icon="📱"
            title="Scansiona con il telefono"
            description="Fotografa le pagine del libro e caricale istantaneamente nell'app."
          />
          <FeatureItem
            icon="🔒"
            title="I tuoi dati sono tuoi"
            description="Nessuna condivisione con terzi. I tuoi appunti restano privati."
          />
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl border border-slate-700 p-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Pronto a studiare meglio?
          </h2>
          <p className="text-slate-400 mb-8">
            Inizia gratuitamente. Nessuna carta di credito richiesta.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-white text-slate-900 px-8 py-4 rounded-full font-semibold hover:bg-slate-100 transition-colors"
          >
            Crea account gratuito
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 py-8">
        <div className="max-w-5xl mx-auto px-6 text-center text-slate-500">
          <p>© 2025 Backup Buddy. Studia meglio, non di più.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 p-6 rounded-2xl bg-slate-800/30 border border-slate-700/50">
      <div className="text-3xl">{icon}</div>
      <div>
        <h3 className="text-white font-semibold mb-2">{title}</h3>
        <p className="text-slate-400">{description}</p>
      </div>
    </div>
  );
}

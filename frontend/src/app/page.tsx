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
    <div className="min-h-screen bg-[#020617] relative overflow-hidden">
      {/* Aurora Background Blobs */}
      <div className="absolute -top-40 -left-40 w-[600px] h-[600px] bg-purple-900/30 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute -bottom-40 -right-40 w-[600px] h-[600px] bg-blue-900/30 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s', animationDelay: '4s' }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-900/10 rounded-full blur-3xl" />

      {/* Navbar */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/25">
            <span className="text-white text-xl">📚</span>
          </div>
          <span className="text-white font-bold text-xl">Backup Buddy</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="text-slate-300 hover:text-white transition-all duration-300 px-4 py-2 rounded-xl hover:bg-white/5"
          >
            Accedi
          </Link>
          <Link
            href="/signup"
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-2.5 rounded-xl font-medium hover:shadow-lg hover:shadow-purple-500/25 transition-all duration-300"
          >
            Inizia gratis
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-5xl mx-auto px-6 pt-24 pb-32 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-full mb-8">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
          <span className="text-slate-300 text-sm">Powered by AI</span>
        </div>

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
            className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:shadow-xl hover:shadow-purple-500/30 transition-all duration-300 hover:scale-105"
          >
            Prova Backup Buddy gratis →
          </Link>
          <Link
            href="/login"
            className="bg-white/5 backdrop-blur-md border border-white/10 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-white/10 hover:border-purple-500/50 transition-all duration-300"
          >
            Ho già un account
          </Link>
        </div>

        {/* Visual Preview */}
        <div className="mt-24 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-transparent to-transparent z-10 pointer-events-none"></div>
          <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 p-8 shadow-2xl">
            <div className="grid md:grid-cols-3 gap-6">
              {/* Source Card */}
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 text-left border border-white/10 hover:border-purple-500/50 transition-all duration-300 group">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600/20 to-blue-600/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <span className="text-2xl">📚</span>
                </div>
                <h3 className="text-white font-semibold mb-2">Carica le fonti</h3>
                <p className="text-slate-400 text-sm">
                  PDF, foto di libri, appunti scritti a mano
                </p>
              </div>

              {/* AI Card */}
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 text-left border border-white/10 hover:border-purple-500/50 transition-all duration-300 group">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-600/20 to-purple-600/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                  <span className="text-2xl">✨</span>
                </div>
                <h3 className="text-white font-semibold mb-2">AI genera contenuti</h3>
                <p className="text-slate-400 text-sm">
                  Flashcard, quiz, riassunti automatici
                </p>
              </div>

              {/* Study Card */}
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 text-left border border-white/10 hover:border-purple-500/50 transition-all duration-300 group">
                <div className="w-12 h-12 bg-gradient-to-br from-pink-600/20 to-pink-600/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
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
      <section className="relative z-10 max-w-5xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-white text-center mb-16">
          Perché Backup Buddy?
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
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
      <section className="relative z-10 max-w-3xl mx-auto px-6 py-20 text-center">
        <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 backdrop-blur-md rounded-2xl border border-white/10 p-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Pronto a studiare meglio?
          </h2>
          <p className="text-slate-400 mb-8">
            Inizia gratuitamente. Nessuna carta di credito richiesta.
          </p>
          <Link
            href="/signup"
            className="inline-block bg-gradient-to-r from-blue-600 to-purple-600 text-white px-8 py-4 rounded-xl font-semibold hover:shadow-xl hover:shadow-purple-500/30 transition-all duration-300 hover:scale-105"
          >
            Crea account gratuito
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-8">
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
    <div className="flex gap-4 p-6 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 hover:border-purple-500/50 transition-all duration-300 group">
      <div className="text-3xl group-hover:scale-110 transition-transform duration-300">{icon}</div>
      <div>
        <h3 className="text-white font-semibold mb-2">{title}</h3>
        <p className="text-slate-400">{description}</p>
      </div>
    </div>
  );
}

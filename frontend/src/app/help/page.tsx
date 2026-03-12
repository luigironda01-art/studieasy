"use client";

export const dynamic = "force-dynamic";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import Link from "next/link";

function HelpPageContent() {
  useBreadcrumb([{ label: "Aiuto" }]);

  const faqs = [
    {
      question: "Come carico un nuovo libro?",
      answer: "Vai su 'I miei libri' e clicca 'Aggiungi libro'. Puoi caricare PDF, inserire informazioni manualmente, o scattare foto dei tuoi appunti."
    },
    {
      question: "Come funziona la ripetizione spaziata?",
      answer: "Backup Buddy utilizza l'algoritmo FSRS per ottimizzare i tuoi ripassi. Le flashcard ti vengono mostrate nel momento ideale per massimizzare la memorizzazione a lungo termine."
    },
    {
      question: "Posso modificare le flashcard generate?",
      answer: "Presto! Stiamo lavorando sulla possibilità di modificare, eliminare e aggiungere flashcard manualmente."
    },
    {
      question: "Come funzionano i quiz?",
      answer: "I quiz vengono generati automaticamente dal contenuto dei tuoi capitoli. Includono domande a scelta multipla, vero/falso e risposta aperta con valutazione AI."
    },
    {
      question: "I miei dati sono al sicuro?",
      answer: "Sì! I tuoi dati sono criptati e salvati in modo sicuro. Non condividiamo le tue informazioni con terze parti."
    },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Centro Assistenza</h1>
        <p className="text-slate-400 mb-8">
          Trova risposte alle domande più comuni
        </p>

        {/* Quick links */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Link
            href="/feedback"
            className="bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-slate-600 transition-colors"
          >
            <span className="text-2xl mb-2 block">💬</span>
            <h3 className="text-white font-medium">Invia Feedback</h3>
            <p className="text-slate-400 text-sm">Suggerimenti o problemi</p>
          </Link>
          <a
            href="mailto:support@studio-app.com"
            className="bg-slate-800 rounded-xl border border-slate-700 p-4 hover:border-slate-600 transition-colors"
          >
            <span className="text-2xl mb-2 block">✉️</span>
            <h3 className="text-white font-medium">Email</h3>
            <p className="text-slate-400 text-sm">Contatta il supporto</p>
          </a>
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <span className="text-2xl mb-2 block">📖</span>
            <h3 className="text-white font-medium">Documentazione</h3>
            <p className="text-slate-400 text-sm">Prossimamente</p>
          </div>
        </div>

        {/* FAQs */}
        <div className="bg-slate-800 rounded-xl border border-slate-700">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">Domande Frequenti</h2>
          </div>
          <div className="divide-y divide-slate-700">
            {faqs.map((faq, index) => (
              <details key={index} className="group">
                <summary className="flex items-center justify-between p-4 cursor-pointer text-white hover:bg-slate-700/50 transition-colors">
                  <span>{faq.question}</span>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">
                    ▼
                  </span>
                </summary>
                <div className="px-4 pb-4 text-slate-400">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HelpPage() {
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
      <HelpPageContent />
    </AppLayout>
  );
}

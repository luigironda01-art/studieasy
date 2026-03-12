"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase } from "@/lib/supabase";

type FeedbackType = "bug" | "feature" | "ux" | "ai" | null;

function FeedbackPageContent() {
  useBreadcrumb([{ label: "Feedback" }]);
  const { user } = useAuth();

  const [selectedType, setSelectedType] = useState<FeedbackType>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const feedbackTypes = [
    { id: "bug" as const, icon: "🐛", label: "Bug", description: "Qualcosa non funziona" },
    { id: "feature" as const, icon: "💡", label: "Idea", description: "Suggerisci una funzionalità" },
    { id: "ux" as const, icon: "🎨", label: "UX", description: "Migliora l'esperienza" },
    { id: "ai" as const, icon: "🤖", label: "AI", description: "Problemi con generazione" },
  ];

  const handleSubmit = async () => {
    if (!user || !selectedType || !title.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const { error: insertError } = await supabase
        .from("feedbacks")
        .insert({
          user_id: user.id,
          user_email: user.email,
          type: selectedType,
          title: title.trim(),
          description: description.trim() || null,
        });

      if (insertError) throw insertError;
      setSubmitted(true);
    } catch (err) {
      console.error("Error submitting feedback:", err);
      setError("Errore durante l'invio. Riprova.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-6 md:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-slate-800 rounded-2xl border border-slate-700 p-12 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">✓</span>
            </div>
            <h2 className="text-xl font-semibold text-white mb-3">
              Grazie per il feedback!
            </h2>
            <p className="text-slate-400 mb-6">
              Il tuo messaggio è stato salvato. Lo esamineremo presto.
            </p>
            <button
              onClick={() => {
                setSubmitted(false);
                setSelectedType(null);
                setTitle("");
                setDescription("");
              }}
              className="px-6 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors"
            >
              Invia altro feedback
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      {/* Back button */}
      <div className="max-w-2xl mx-auto mb-4">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Indietro
        </button>
      </div>

      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-2">Invia Feedback</h1>
        <p className="text-slate-400 mb-8">
          Aiutaci a migliorare Studieasy con i tuoi suggerimenti
        </p>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {!selectedType ? (
          /* Type selection */
          <div className="grid grid-cols-2 gap-4">
            {feedbackTypes.map((type) => (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                className="bg-slate-800 rounded-xl border border-slate-700 p-6 text-left hover:border-slate-600 transition-colors"
              >
                <span className="text-3xl mb-3 block">{type.icon}</span>
                <h3 className="text-white font-semibold mb-1">{type.label}</h3>
                <p className="text-slate-400 text-sm">{type.description}</p>
              </button>
            ))}
          </div>
        ) : (
          /* Feedback form */
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6">
            <button
              onClick={() => setSelectedType(null)}
              className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-2"
            >
              ← Cambia tipo
            </button>

            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">
                {feedbackTypes.find((t) => t.id === selectedType)?.icon}
              </span>
              <span className="text-white font-semibold">
                {feedbackTypes.find((t) => t.id === selectedType)?.label}
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-slate-400 text-sm mb-2">Titolo</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Descrivi brevemente..."
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-sm mb-2">Descrizione</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Fornisci più dettagli..."
                  rows={5}
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!title.trim() || submitting}
                className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Invio in corso...
                  </>
                ) : (
                  "Invia Feedback"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FeedbackPage() {
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
      <FeedbackPageContent />
    </AppLayout>
  );
}

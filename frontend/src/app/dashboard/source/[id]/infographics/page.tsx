"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useBreadcrumb } from "@/contexts/BreadcrumbContext";
import { supabase, Source, Chapter } from "@/lib/supabase";

interface InfographicData {
  title: string;
  imageUrl: string;
  extractedContent?: string;
  generatedAt?: string;
}

export default function InfographicsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const sourceId = params.id as string;

  const [source, setSource] = useState<Source | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string>("__all__");
  const [infographic, setInfographic] = useState<InfographicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [zoomed, setZoomed] = useState(false);

  useBreadcrumb(
    source
      ? [
          { label: "I miei libri", href: "/dashboard" },
          { label: source.title, href: `/dashboard/source/${sourceId}` },
          { label: "Infografica" },
        ]
      : []
  );

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user && sourceId) fetchData();
  }, [user, authLoading, sourceId]);

  const fetchData = async () => {
    setLoading(true);
    const { data: src } = await supabase.from("sources").select("*").eq("id", sourceId).single();
    if (src) setSource(src);

    const { data: chs } = await supabase
      .from("chapters")
      .select("id, title, processing_status, order_index")
      .eq("source_id", sourceId)
      .eq("processing_status", "completed")
      .order("order_index");
    if (chs) setChapters(chs as Chapter[]);

    const { data: existing } = await supabase
      .from("infographics")
      .select("content")
      .eq("source_id", sourceId)
      .eq("user_id", user!.id)
      .is("chapter_id", null)
      .single();
    if (existing) setInfographic(existing.content as InfographicData);

    setLoading(false);
  };

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    setError("");

    await fetch("/api/infographics/generate", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        chapterId: selectedChapterId === "__all__" ? null : selectedChapterId,
        userId: user.id,
      }),
    });

    const res = await fetch("/api/infographics/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceId,
        chapterId: selectedChapterId === "__all__" ? null : selectedChapterId,
        userId: user.id,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setInfographic(data.infographic);
    } else {
      const errData = await res.json().catch(() => ({}));
      setError(errData.error || "Errore nella generazione dell'infografica. Riprova.");
    }
    setGenerating(false);
  };

  const exportPng = useCallback(async () => {
    if (!infographic?.imageUrl) return;
    const a = document.createElement("a");
    a.href = infographic.imageUrl;
    a.download = `${infographic.title?.replace(/\s+/g, "_") || "infografica"}.png`;
    a.target = "_blank";
    a.click();
  }, [infographic]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/source/${sourceId}`}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {source?.title}
          </Link>
          <span className="text-slate-600">/</span>
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h1 className="text-white font-semibold">Infografica</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {chapters.length > 1 && (
            <select
              value={selectedChapterId}
              onChange={e => setSelectedChapterId(e.target.value)}
              className="bg-white/5 border border-white/10 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-purple-500"
            >
              <option value="__all__">Libro intero</option>
              {chapters.map(ch => (
                <option key={ch.id} value={ch.id}>{ch.title}</option>
              ))}
            </select>
          )}

          {infographic && (
            <button
              onClick={exportPng}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-slate-300 rounded-lg hover:bg-white/10 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Scarica
            </button>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || chapters.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium disabled:opacity-50"
          >
            {generating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Generando...
              </>
            ) : infographic ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Rigenera
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Genera Infografica
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm shrink-0">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!infographic && !generating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl flex items-center justify-center">
              <span className="text-5xl">📊</span>
            </div>
            <h3 className="text-white font-semibold text-xl">Nessuna infografica generata</h3>
            <p className="text-slate-400 text-center max-w-sm">
              Genera un&apos;infografica AI che riassume visivamente tutti i concetti chiave del tuo materiale
            </p>
            {chapters.length === 0 && (
              <p className="text-amber-400 text-sm">Elabora prima un capitolo per generare l&apos;infografica</p>
            )}
          </div>
        ) : generating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500" />
            <p className="text-slate-300">Generando l&apos;infografica con AI...</p>
            <p className="text-slate-500 text-sm">Potrebbe richiedere fino a 30 secondi</p>
          </div>
        ) : infographic?.imageUrl ? (
          <div className="flex flex-col items-center py-6 px-4">
            <div
              className={`relative cursor-zoom-in transition-all duration-300 ${
                zoomed ? "max-w-none w-full" : "max-w-5xl w-full"
              }`}
              onClick={() => setZoomed(!zoomed)}
            >
              <img
                src={infographic.imageUrl}
                alt={infographic.title || "Infografica"}
                className="w-full h-auto rounded-xl border border-white/10 shadow-2xl"
              />
              <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {zoomed ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  )}
                </svg>
                {zoomed ? "Riduci" : "Ingrandisci"}
              </div>
            </div>
            {infographic.generatedAt && (
              <p className="text-slate-500 text-xs mt-4">
                Generata il {new Date(infographic.generatedAt).toLocaleDateString("it-IT", {
                  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
                })}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {/* Zoom overlay */}
      {zoomed && infographic?.imageUrl && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setZoomed(false)}
        >
          <img
            src={infographic.imageUrl}
            alt={infographic.title || "Infografica"}
            className="max-w-full max-h-full object-contain rounded-lg"
          />
          <button
            onClick={() => setZoomed(false)}
            className="absolute top-4 right-4 bg-white/10 backdrop-blur-sm text-white rounded-full w-10 h-10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

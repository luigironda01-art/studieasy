"use client";

import { useState, useRef, DragEvent } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface AddSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddSourceModal({ isOpen, onClose, onSuccess }: AddSourceModalProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [sourceType, setSourceType] = useState<"pdf" | "notes">("pdf");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === "application/pdf") {
      setFile(droppedFile);
      if (!title) {
        // Auto-fill title from filename
        setTitle(droppedFile.name.replace(".pdf", ""));
      }
    } else {
      setError("Per favore carica un file PDF");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      if (!title) {
        setTitle(selectedFile.name.replace(".pdf", ""));
      }
    } else {
      setError("Per favore carica un file PDF");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setError("");
    setLoading(true);

    try {
      let fileUrl = null;

      // Upload file if PDF selected
      if (sourceType === "pdf" && file) {
        setUploadProgress(10);
        const fileExt = file.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, file);

        if (uploadError) {
          throw new Error(`Errore upload: ${uploadError.message}`);
        }

        setUploadProgress(70);

        const { data: urlData } = supabase.storage
          .from("documents")
          .getPublicUrl(fileName);

        fileUrl = urlData.publicUrl;
        setUploadProgress(90);
      }

      // Create source record
      const { data: sourceData, error: insertError } = await supabase
        .from("sources")
        .insert({
          user_id: user.id,
          title,
          author: author || null,
          source_type: sourceType,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // If PDF, create a chapter with the file reference
      if (sourceType === "pdf" && fileUrl && sourceData) {
        console.log("Creating chapter with file_url:", fileUrl);
        const { error: chapterError } = await supabase.from("chapters").insert({
          source_id: sourceData.id,
          title: "Documento completo",
          order_index: 0,
          file_url: fileUrl,
          processing_status: "pending",
        });

        if (chapterError) {
          console.error("Chapter insert error:", chapterError);
          throw new Error(`Errore creazione capitolo: ${chapterError.message}`);
        }
        console.log("Chapter created successfully with file_url");
      }

      setUploadProgress(100);

      // Reset form
      setTitle("");
      setAuthor("");
      setSourceType("pdf");
      setFile(null);
      setUploadProgress(0);

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto");
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTitle("");
    setAuthor("");
    setSourceType("pdf");
    setFile(null);
    setError("");
    setUploadProgress(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={resetForm}
      />

      {/* Modal */}
      <div className="relative bg-slate-800 rounded-2xl border border-slate-700 p-8 w-full max-w-md mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={resetForm}
          className="absolute top-4 right-4 text-slate-400 hover:text-white text-2xl"
        >
          ×
        </button>

        <h2 className="text-2xl font-bold text-white mb-6">Aggiungi fonte</h2>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Tipo di fonte
            </label>
            <div className="grid grid-cols-2 gap-3">
              <TypeButton
                selected={sourceType === "pdf"}
                onClick={() => setSourceType("pdf")}
                icon="📄"
                label="PDF"
              />
              <TypeButton
                selected={sourceType === "notes"}
                onClick={() => { setSourceType("notes"); setFile(null); }}
                icon="📝"
                label="Testo digitale"
              />
            </div>
          </div>

          {/* File Upload for PDF */}
          {sourceType === "pdf" && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                File PDF
              </label>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? "border-blue-500 bg-blue-500/10"
                    : file
                    ? "border-green-500 bg-green-500/10"
                    : "border-slate-600 hover:border-slate-500"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {file ? (
                  <div className="text-green-400">
                    <span className="text-2xl">✓</span>
                    <p className="mt-2 font-medium">{file.name}</p>
                    <p className="text-sm text-slate-400 mt-1">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div className="text-slate-400">
                    <span className="text-3xl">📄</span>
                    <p className="mt-2">
                      Trascina qui il PDF o{" "}
                      <span className="text-blue-400">clicca per selezionare</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <label htmlFor="title" className="block text-sm font-medium text-slate-300 mb-2">
              Titolo *
            </label>
            <input
              id="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Es. Fisica 1 - Meccanica"
            />
          </div>

          <div>
            <label htmlFor="author" className="block text-sm font-medium text-slate-300 mb-2">
              Autore (opzionale)
            </label>
            <input
              id="author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Es. Mario Rossi"
            />
          </div>

          {/* Progress bar */}
          {loading && uploadProgress > 0 && (
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="flex-1 px-4 py-3 bg-slate-700 text-white rounded-xl font-medium hover:bg-slate-600 transition-colors"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={loading || !title || (sourceType === "pdf" && !file)}
              className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Caricamento..." : "Aggiungi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TypeButton({
  selected,
  onClick,
  icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  icon: string;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-3 rounded-xl border-2 transition-all ${
        selected
          ? "border-blue-500 bg-blue-500/20 text-white"
          : "border-slate-600 bg-slate-700 text-slate-400 hover:border-slate-500"
      }`}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-sm font-medium">{label}</div>
    </button>
  );
}

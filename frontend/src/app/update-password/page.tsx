"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let hasToken = false;

    // Listen for auth state changes FIRST (Supabase processes the token automatically)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("Auth event:", event, session ? "has session" : "no session");
      if (event === "PASSWORD_RECOVERY") {
        if (timeoutId) clearTimeout(timeoutId);
        setError(""); // Clear any error
        setIsReady(true);
      } else if (event === "SIGNED_IN" && session) {
        if (timeoutId) clearTimeout(timeoutId);
        setIsReady(true);
      }
    });

    // Handle the auth callback from the reset password link
    const handleAuthCallback = async () => {
      // Check URL for error or token (Supabase adds these as hash params)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const errorParam = hashParams.get("error_description");
      const accessToken = hashParams.get("access_token");
      const type = hashParams.get("type");

      if (errorParam) {
        setError(decodeURIComponent(errorParam));
        setIsReady(true);
        return;
      }

      // If there's an access token in the URL hash for recovery
      if (accessToken && type === "recovery") {
        hasToken = true;
        // Give Supabase time to process the token automatically
        // The onAuthStateChange will handle it
        timeoutId = setTimeout(async () => {
          // If still not ready after 3 seconds, check session manually
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            setIsReady(true);
          } else {
            setError("Link non valido o scaduto. Richiedi un nuovo link di reset.");
            setIsReady(true);
          }
        }, 3000);
        return;
      }

      // No token in URL - check if already logged in
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setIsReady(true);
      } else {
        // No session and no token - show error
        setError("Link non valido o scaduto. Richiedi un nuovo link di reset.");
        setIsReady(true);
      }
    };

    // Small delay to ensure subscription is active before checking
    setTimeout(handleAuthCallback, 100);

    return () => {
      subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Le password non corrispondono");
      return;
    }

    if (password.length < 6) {
      setError("La password deve essere di almeno 6 caratteri");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
        // Redirect to dashboard after 2 seconds
        setTimeout(() => {
          router.push("/dashboard");
        }, 2000);
      }
    } catch (err) {
      setError("Errore durante l'aggiornamento della password. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking auth state
  if (!isReady) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-slate-400">Verifica in corso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-white font-semibold text-2xl">Studieasy</span>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 shadow-xl">
          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✓</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-2">
                Password aggiornata!
              </h1>
              <p className="text-slate-400 mb-6">
                Stai per essere reindirizzato alla dashboard...
              </p>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-white text-center mb-2">
                Nuova password
              </h1>
              <p className="text-slate-400 text-center mb-8">
                Inserisci la tua nuova password
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-xl text-sm">
                    {error}
                    <Link href="/reset-password" className="block mt-2 text-blue-400 hover:text-blue-300">
                      Richiedi un nuovo link
                    </Link>
                  </div>
                )}

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                    Nuova password
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                    minLength={6}
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                    Conferma password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="••••••••"
                    minLength={6}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Aggiornamento..." : "Aggiorna password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

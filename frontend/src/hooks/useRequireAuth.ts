"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Hook per pagine che richiedono autenticazione.
 * Gestisce redirect al login e stato di loading in modo consistente.
 */
export function useRequireAuth() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Aspetta che l'auth sia completato
    if (authLoading) return;

    // Se non c'è utente, redirect al login
    if (!user) {
      router.push("/login");
      return;
    }

    // Utente autenticato, siamo pronti
    setIsReady(true);
  }, [user, authLoading, router]);

  return {
    user,
    isReady,
    isLoading: authLoading || (!isReady && !!user),
  };
}

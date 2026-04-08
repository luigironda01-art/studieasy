import { supabase } from "./supabase";

/**
 * Authenticated fetch wrapper that automatically adds the Supabase
 * session token to API requests. Use this for all calls to /api/* routes
 * that handle user data.
 */
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(url, { ...init, headers });
}

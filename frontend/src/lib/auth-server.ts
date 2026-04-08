import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

/**
 * Validates the request session and returns the authenticated user ID.
 * Returns null if no valid session is present.
 *
 * Use in API routes to prevent IDOR attacks where an attacker passes
 * arbitrary userId values in the request body.
 */
export async function getAuthenticatedUserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!authHeader) return null;

  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;

  return data.user.id;
}

/**
 * Validates the request session and ensures the userId in the body matches.
 * Returns the validated userId, or null if validation fails.
 *
 * If no auth header is present, falls back to the body userId for backwards
 * compatibility (will be removed in a future security hardening pass).
 */
export async function validateUserId(
  request: NextRequest,
  bodyUserId: string | undefined,
): Promise<{ userId: string | null; error?: string }> {
  if (!bodyUserId) {
    return { userId: null, error: "Missing userId" };
  }

  const sessionUserId = await getAuthenticatedUserId(request);

  // If session is valid, the body userId MUST match the session
  if (sessionUserId) {
    if (sessionUserId !== bodyUserId) {
      return { userId: null, error: "Forbidden: userId mismatch" };
    }
    return { userId: sessionUserId };
  }

  // No session header — accept body userId (backwards compat for now)
  // TODO: tighten this once frontend always sends auth headers
  return { userId: bodyUserId };
}

/**
 * Returns the list of admin user IDs from the ADMIN_USER_IDS env var.
 */
export function getAdminUserIds(): Set<string> {
  const raw = process.env.ADMIN_USER_IDS || "";
  return new Set(
    raw.split(",").map(id => id.trim()).filter(Boolean)
  );
}

/**
 * Validates that the request comes from an admin user.
 * Returns the admin user ID, or null with error message.
 *
 * Checks both the session header AND that the user is in ADMIN_USER_IDS.
 */
export async function requireAdmin(
  request: NextRequest,
): Promise<{ userId: string | null; error?: string }> {
  const sessionUserId = await getAuthenticatedUserId(request);
  if (!sessionUserId) {
    return { userId: null, error: "Unauthorized: missing session" };
  }
  const admins = getAdminUserIds();
  if (!admins.has(sessionUserId)) {
    return { userId: null, error: "Forbidden: admin only" };
  }
  return { userId: sessionUserId };
}

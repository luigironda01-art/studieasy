import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * Lightweight check used by the frontend to know whether the current user
 * is an admin (so the sidebar can show/hide the admin link).
 */
export async function GET(request: NextRequest) {
  const { userId } = await requireAdmin(request);
  return NextResponse.json({ isAdmin: !!userId });
}

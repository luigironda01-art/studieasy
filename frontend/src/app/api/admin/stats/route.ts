import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { userId, error } = await requireAdmin(request);
  if (!userId) {
    return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Run all aggregations in parallel
  const [
    profilesRes,
    sourcesRes,
    chaptersRes,
    flashcardsRes,
    quizzesRes,
    summariesRes,
    mindmapsRes,
    presentationsRes,
    infographicsRes,
    messagesRes,
    activeUsersRes,
    activeUsers30Res,
    usageLogsRes,
  ] = await Promise.all([
    supabase.from("profiles").select("id, created_at"),
    supabase.from("sources").select("id, created_at, user_id"),
    supabase.from("chapters").select("id, page_count, processing_status"),
    supabase.from("flashcards").select("id"),
    supabase.from("quizzes").select("id"),
    supabase.from("summaries").select("id"),
    supabase.from("mindmaps").select("id"),
    supabase.from("presentations").select("id"),
    supabase.from("infographics").select("id"),
    supabase.from("messages").select("id, role"),
    supabase.from("messages").select("conversation_id, conversations!inner(user_id)").gte("created_at", sevenDaysAgo),
    supabase.from("messages").select("conversation_id, conversations!inner(user_id)").gte("created_at", thirtyDaysAgo),
    supabase.from("usage_logs").select("action_type, tokens_input, tokens_output, model_used, duration_ms, status, created_at").gte("created_at", thirtyDaysAgo),
  ]);

  const profiles = profilesRes.data || [];
  const sources = sourcesRes.data || [];
  const chapters = chaptersRes.data || [];
  const messages = messagesRes.data || [];

  // Active users (distinct users with activity in last 7/30 days)
  const active7d = new Set<string>();
  for (const m of (activeUsersRes.data || []) as Array<{ conversations: { user_id: string } | { user_id: string }[] }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations;
    if (conv?.user_id) active7d.add(conv.user_id);
  }
  const active30d = new Set<string>();
  for (const m of (activeUsersRes.data || []) as Array<{ conversations: { user_id: string } | { user_id: string }[] }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations;
    if (conv?.user_id) active30d.add(conv.user_id);
  }
  for (const m of (activeUsers30Res.data || []) as Array<{ conversations: { user_id: string } | { user_id: string }[] }>) {
    const conv = Array.isArray(m.conversations) ? m.conversations[0] : m.conversations;
    if (conv?.user_id) active30d.add(conv.user_id);
  }

  // Total pages processed
  const totalPages = chapters.reduce((acc, c) => acc + (c.page_count || 0), 0);
  const completedChapters = chapters.filter(c => c.processing_status === "completed").length;
  const failedChapters = chapters.filter(c => c.processing_status === "error").length;

  // Messages stats
  const userMessages = messages.filter(m => m.role === "user").length;

  // New users in last 30d
  const newUsers30d = profiles.filter(p => p.created_at && new Date(p.created_at) >= new Date(thirtyDaysAgo)).length;

  // Cost estimation from usage logs
  const usageLogs = usageLogsRes.data || [];
  let totalCost = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  const costsByAction: Record<string, number> = {};

  // Rough pricing per 1M tokens (approximation)
  const PRICING: Record<string, { input: number; output: number }> = {
    "anthropic/claude-3.5-sonnet": { input: 3, output: 15 },
    "anthropic/claude-sonnet-4": { input: 3, output: 15 },
    "google/gemini-2.0-flash-001": { input: 0.1, output: 0.4 },
    "google/gemini-2.5-flash-image": { input: 0.3, output: 30 },
    "google/gemini-3-pro-image-preview": { input: 2, output: 12 },
    "perplexity/sonar-pro": { input: 3, output: 15 },
  };

  for (const log of usageLogs) {
    const tin = log.tokens_input || 0;
    const tout = log.tokens_output || 0;
    totalTokensIn += tin;
    totalTokensOut += tout;
    const price = PRICING[log.model_used] || { input: 1, output: 5 };
    const cost = (tin / 1_000_000) * price.input + (tout / 1_000_000) * price.output;
    totalCost += cost;
    costsByAction[log.action_type] = (costsByAction[log.action_type] || 0) + cost;
  }

  const errorCount = usageLogs.filter(l => l.status === "error").length;
  const successCount = usageLogs.filter(l => l.status === "success").length;
  const avgDurationMs = usageLogs.length > 0
    ? Math.round(usageLogs.reduce((a, l) => a + (l.duration_ms || 0), 0) / usageLogs.length)
    : 0;

  return NextResponse.json({
    overview: {
      totalUsers: profiles.length,
      activeUsers7d: active7d.size,
      activeUsers30d: active30d.size,
      newUsers30d,
      totalSources: sources.length,
      totalChapters: chapters.length,
      completedChapters,
      failedChapters,
      totalPagesProcessed: totalPages,
      totalFlashcards: flashcardsRes.data?.length || 0,
      totalQuizzes: quizzesRes.data?.length || 0,
      totalSummaries: summariesRes.data?.length || 0,
      totalMindmaps: mindmapsRes.data?.length || 0,
      totalPresentations: presentationsRes.data?.length || 0,
      totalInfographics: infographicsRes.data?.length || 0,
      totalChatMessages: userMessages,
    },
    aiUsage: {
      totalCost30d: Math.round(totalCost * 100) / 100,
      totalTokensInput: totalTokensIn,
      totalTokensOutput: totalTokensOut,
      totalCalls: usageLogs.length,
      successCalls: successCount,
      errorCalls: errorCount,
      avgDurationMs,
      costsByAction,
    },
  });
}

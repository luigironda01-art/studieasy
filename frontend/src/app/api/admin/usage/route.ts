import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

// Pricing per 1M tokens (rough estimates from public pricing)
const PRICING: Record<string, { input: number; output: number }> = {
  "anthropic/claude-3.5-sonnet": { input: 3, output: 15 },
  "anthropic/claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "google/gemini-2.0-flash-001": { input: 0.1, output: 0.4 },
  "google/gemini-2.5-flash-image": { input: 0.3, output: 30 },
  "google/gemini-3-pro-image-preview": { input: 2, output: 12 },
  "perplexity/sonar-pro": { input: 3, output: 15 },
};

function priceFor(model: string) {
  return PRICING[model] || { input: 1, output: 5 };
}

export async function GET(request: NextRequest) {
  const { userId, error } = await requireAdmin(request);
  if (!userId) {
    return NextResponse.json({ error: error || "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Last 30 days of usage logs
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: logs, error: logsError } = await supabase
    .from("usage_logs")
    .select("user_id, action_type, tokens_input, tokens_output, model_used, duration_ms, status, error_message, items_generated, created_at")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false });

  if (logsError) {
    return NextResponse.json({ error: logsError.message }, { status: 500 });
  }

  const allLogs = logs || [];

  // Aggregate by action type
  const byAction: Record<string, { count: number; tokensIn: number; tokensOut: number; cost: number; errors: number; avgDurationMs: number; totalDuration: number }> = {};
  // Aggregate by model
  const byModel: Record<string, { count: number; tokensIn: number; tokensOut: number; cost: number }> = {};
  // Aggregate by day
  const byDay: Record<string, { calls: number; cost: number; errors: number }> = {};

  let totalCost = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalErrors = 0;

  for (const log of allLogs) {
    const tin = log.tokens_input || 0;
    const tout = log.tokens_output || 0;
    const price = priceFor(log.model_used || "");
    const cost = (tin / 1_000_000) * price.input + (tout / 1_000_000) * price.output;

    totalCost += cost;
    totalTokensIn += tin;
    totalTokensOut += tout;
    if (log.status === "error") totalErrors++;

    // By action
    const action = log.action_type || "unknown";
    if (!byAction[action]) {
      byAction[action] = { count: 0, tokensIn: 0, tokensOut: 0, cost: 0, errors: 0, avgDurationMs: 0, totalDuration: 0 };
    }
    byAction[action].count++;
    byAction[action].tokensIn += tin;
    byAction[action].tokensOut += tout;
    byAction[action].cost += cost;
    byAction[action].totalDuration += log.duration_ms || 0;
    if (log.status === "error") byAction[action].errors++;

    // By model
    const model = log.model_used || "unknown";
    if (!byModel[model]) {
      byModel[model] = { count: 0, tokensIn: 0, tokensOut: 0, cost: 0 };
    }
    byModel[model].count++;
    byModel[model].tokensIn += tin;
    byModel[model].tokensOut += tout;
    byModel[model].cost += cost;

    // By day
    const day = (log.created_at || "").slice(0, 10);
    if (!byDay[day]) {
      byDay[day] = { calls: 0, cost: 0, errors: 0 };
    }
    byDay[day].calls++;
    byDay[day].cost += cost;
    if (log.status === "error") byDay[day].errors++;
  }

  // Compute averages
  for (const a in byAction) {
    byAction[a].avgDurationMs = byAction[a].count > 0
      ? Math.round(byAction[a].totalDuration / byAction[a].count)
      : 0;
    byAction[a].cost = Math.round(byAction[a].cost * 100) / 100;
  }
  for (const m in byModel) {
    byModel[m].cost = Math.round(byModel[m].cost * 100) / 100;
  }
  const dayList = Object.entries(byDay)
    .map(([day, v]) => ({ day, calls: v.calls, cost: Math.round(v.cost * 100) / 100, errors: v.errors }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Recent errors
  const recentErrors = allLogs
    .filter(l => l.status === "error")
    .slice(0, 20)
    .map(l => ({
      action: l.action_type,
      model: l.model_used,
      error: l.error_message,
      createdAt: l.created_at,
    }));

  return NextResponse.json({
    summary: {
      totalCost: Math.round(totalCost * 100) / 100,
      totalCalls: allLogs.length,
      totalErrors,
      totalTokensIn,
      totalTokensOut,
      successRate: allLogs.length > 0
        ? Math.round(((allLogs.length - totalErrors) / allLogs.length) * 100)
        : 100,
    },
    byAction,
    byModel,
    byDay: dayList,
    recentErrors,
  });
}

/**
 * Usage Logger - Track API usage for analytics
 */

import { createClient } from "@supabase/supabase-js";

// Cost estimates per 1K tokens (in USD)
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "anthropic/claude-3.5-sonnet": { input: 0.003, output: 0.015 },
  "anthropic/claude-3-haiku": { input: 0.00025, output: 0.00125 },
  "google/gemini-2.0-flash-001": { input: 0.0001, output: 0.0004 },
  "google/gemini-1.5-pro": { input: 0.00125, output: 0.005 },
};

export type ActionType =
  | "scan_pdf"
  | "process_chapter"
  | "generate_flashcards"
  | "generate_quiz"
  | "generate_summary"
  | "generate_ai_focus"
  | "evaluate_answer"
  | "upload_file";

export interface UsageLogData {
  userId: string;
  actionType: ActionType;
  sourceId?: string;
  chapterId?: string;
  fileName?: string;
  fileSizeBytes?: number;
  fileType?: string;
  pagesCount?: number;
  tokensInput?: number;
  tokensOutput?: number;
  modelUsed?: string;
  itemsGenerated?: number;
  difficulty?: string;
  durationMs?: number;
  status?: "success" | "error" | "partial";
  errorMessage?: string;
}

/**
 * Calculate estimated cost based on tokens and model
 */
export function calculateCost(
  tokensInput: number,
  tokensOutput: number,
  modelUsed: string
): number {
  const costs = MODEL_COSTS[modelUsed] || { input: 0.001, output: 0.005 };
  const inputCost = (tokensInput / 1000) * costs.input;
  const outputCost = (tokensOutput / 1000) * costs.output;
  return inputCost + outputCost;
}

/**
 * Log usage to database
 */
export async function logUsage(data: UsageLogData): Promise<string | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Calculate cost if tokens and model provided
    let estimatedCostUsd: number | undefined;
    if (data.tokensInput && data.modelUsed) {
      estimatedCostUsd = calculateCost(
        data.tokensInput,
        data.tokensOutput || 0,
        data.modelUsed
      );
    }

    const { data: result, error } = await supabase
      .from("usage_logs")
      .insert({
        user_id: data.userId,
        action_type: data.actionType,
        source_id: data.sourceId || null,
        chapter_id: data.chapterId || null,
        file_name: data.fileName || null,
        file_size_bytes: data.fileSizeBytes || null,
        file_type: data.fileType || null,
        pages_count: data.pagesCount || null,
        tokens_input: data.tokensInput || null,
        tokens_output: data.tokensOutput || null,
        model_used: data.modelUsed || null,
        estimated_cost_usd: estimatedCostUsd || null,
        items_generated: data.itemsGenerated || null,
        difficulty: data.difficulty || null,
        duration_ms: data.durationMs || null,
        status: data.status || "success",
        error_message: data.errorMessage || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to log usage:", error);
      return null;
    }

    return result?.id || null;
  } catch (err) {
    // Don't throw - logging should never break the main operation
    console.error("Usage logging error:", err);
    return null;
  }
}

/**
 * Wrapper to measure duration and log usage
 */
export async function withUsageLogging<T>(
  data: Omit<UsageLogData, "durationMs" | "status" | "errorMessage">,
  operation: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await operation();
    const durationMs = Date.now() - startTime;

    // Log success
    await logUsage({
      ...data,
      durationMs,
      status: "success",
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Log error
    await logUsage({
      ...data,
      durationMs,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    throw error;
  }
}

/**
 * Estimate tokens from text (rough approximation)
 * ~4 characters per token for English, ~3 for other languages
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

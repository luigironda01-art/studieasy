import { createClient } from "@supabase/supabase-js";

const supabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export type GenerationType = "flashcards" | "quiz" | "summary" | "mindmap" | "slides" | "infographic";

export async function trackGeneration(
  userId: string,
  sourceId: string,
  type: GenerationType,
  chapterId?: string | null,
  metadata?: Record<string, string>,
): Promise<string | null> {
  const { data, error } = await supabase()
    .from("generations")
    .insert({
      user_id: userId,
      source_id: sourceId,
      chapter_id: chapterId || null,
      type,
      status: "generating",
      progress: 0,
      metadata: metadata || {},
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to track generation:", error);
    return null;
  }
  return data?.id || null;
}

export async function updateGeneration(
  generationId: string,
  updates: { status?: string; progress?: number; result_url?: string },
) {
  const updateData: Record<string, unknown> = { ...updates };
  if (updates.status === "completed" || updates.status === "failed") {
    updateData.completed_at = new Date().toISOString();
  }
  await supabase()
    .from("generations")
    .update(updateData)
    .eq("id", generationId);
}

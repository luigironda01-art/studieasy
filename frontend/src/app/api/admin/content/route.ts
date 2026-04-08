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

  // Fetch sources with chapters and user info
  const [
    { data: sources },
    { data: chapters },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("sources").select("id, title, user_id, created_at, file_url").order("created_at", { ascending: false }),
    supabase.from("chapters").select("id, source_id, title, processing_status, page_count, chars_extracted, extraction_quality, extraction_method, created_at, order_index"),
    supabase.from("profiles").select("id, display_name"),
  ]);

  const profileMap: Record<string, string> = {};
  for (const p of (profiles || []) as Array<{ id: string; display_name: string | null }>) {
    profileMap[p.id] = p.display_name || "Senza nome";
  }

  // Group chapters by source
  const chaptersBySource: Record<string, Array<{ id: string; title: string; processing_status: string; page_count: number | null; chars_extracted: number | null; extraction_quality: number | null; extraction_method: string | null; order_index: number | null }>> = {};
  for (const c of (chapters || []) as Array<{ id: string; source_id: string; title: string; processing_status: string; page_count: number | null; chars_extracted: number | null; extraction_quality: number | null; extraction_method: string | null; order_index: number | null }>) {
    if (!chaptersBySource[c.source_id]) chaptersBySource[c.source_id] = [];
    chaptersBySource[c.source_id].push(c);
  }

  // Sort chapters within each source by order_index
  for (const sid in chaptersBySource) {
    chaptersBySource[sid].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  }

  const enrichedSources = (sources || []).map(s => {
    const chs = chaptersBySource[s.id] || [];
    const totalPages = chs.reduce((acc, c) => acc + (c.page_count || 0), 0);
    const completed = chs.filter(c => c.processing_status === "completed").length;
    const errored = chs.filter(c => c.processing_status === "error").length;
    const avgQuality = chs.length > 0
      ? Math.round(chs.reduce((acc, c) => acc + (c.extraction_quality || 0), 0) / chs.length)
      : 0;
    const totalChars = chs.reduce((acc, c) => acc + (c.chars_extracted || 0), 0);
    return {
      id: s.id,
      title: s.title,
      ownerName: profileMap[s.user_id] || "Sconosciuto",
      ownerId: s.user_id,
      createdAt: s.created_at,
      hasFile: !!s.file_url,
      chaptersCount: chs.length,
      completedChapters: completed,
      erroredChapters: errored,
      totalPages,
      totalChars,
      avgQuality,
      chapters: chs.map(c => ({
        id: c.id,
        title: c.title,
        status: c.processing_status,
        pages: c.page_count,
        chars: c.chars_extracted,
        quality: c.extraction_quality,
        method: c.extraction_method,
        order: c.order_index,
      })),
    };
  });

  // Problematic chapters (failed or low quality)
  const problematicChapters = (chapters || [])
    .filter(c => c.processing_status === "error" || (c.extraction_quality !== null && c.extraction_quality < 50))
    .map(c => {
      const source = sources?.find(s => s.id === c.source_id);
      return {
        id: c.id,
        title: c.title,
        sourceTitle: source?.title || "Sconosciuto",
        sourceOwner: profileMap[source?.user_id || ""] || "Sconosciuto",
        status: c.processing_status,
        quality: c.extraction_quality,
        method: c.extraction_method,
      };
    });

  return NextResponse.json({
    sources: enrichedSources,
    problematicChapters,
  });
}

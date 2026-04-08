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

  // Fetch all profiles
  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name, language, onboarding_completed, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  // Aggregate stats per user in parallel
  const [
    { data: sources },
    { data: chapters },
    { data: flashcards },
    { data: quizzes },
    { data: summaries },
    { data: mindmaps },
    { data: presentations },
    { data: infographics },
    { data: convs },
    { data: messages },
  ] = await Promise.all([
    supabase.from("sources").select("id, user_id, created_at"),
    supabase.from("chapters").select("source_id, page_count"),
    supabase.from("flashcards").select("id, user_id"),
    supabase.from("quizzes").select("id, user_id"),
    supabase.from("summaries").select("id, user_id"),
    supabase.from("mindmaps").select("id, user_id"),
    supabase.from("presentations").select("id, user_id"),
    supabase.from("infographics").select("id, user_id"),
    supabase.from("conversations").select("id, user_id, updated_at"),
    supabase.from("messages").select("conversation_id, role, created_at"),
  ]);

  // Build maps
  const chapterMap: Record<string, { count: number; pages: number }> = {};
  for (const c of (chapters || []) as Array<{ source_id: string; page_count: number | null }>) {
    if (!chapterMap[c.source_id]) chapterMap[c.source_id] = { count: 0, pages: 0 };
    chapterMap[c.source_id].count++;
    chapterMap[c.source_id].pages += c.page_count || 0;
  }

  const sourcesByUser: Record<string, { count: number; pages: number; chapters: number }> = {};
  for (const s of (sources || []) as Array<{ id: string; user_id: string }>) {
    if (!sourcesByUser[s.user_id]) sourcesByUser[s.user_id] = { count: 0, pages: 0, chapters: 0 };
    sourcesByUser[s.user_id].count++;
    sourcesByUser[s.user_id].pages += chapterMap[s.id]?.pages || 0;
    sourcesByUser[s.user_id].chapters += chapterMap[s.id]?.count || 0;
  }

  const countByUser = (items: Array<{ user_id: string }> | null): Record<string, number> => {
    const m: Record<string, number> = {};
    for (const item of items || []) {
      m[item.user_id] = (m[item.user_id] || 0) + 1;
    }
    return m;
  };

  const flashcardsCount = countByUser(flashcards as Array<{ user_id: string }>);
  const quizzesCount = countByUser(quizzes as Array<{ user_id: string }>);
  const summariesCount = countByUser(summaries as Array<{ user_id: string }>);
  const mindmapsCount = countByUser(mindmaps as Array<{ user_id: string }>);
  const presentationsCount = countByUser(presentations as Array<{ user_id: string }>);
  const infographicsCount = countByUser(infographics as Array<{ user_id: string }>);

  // Conversations by user
  const convByUser: Record<string, { count: number; lastUpdate: string | null }> = {};
  for (const c of (convs || []) as Array<{ id: string; user_id: string; updated_at: string }>) {
    if (!convByUser[c.user_id]) convByUser[c.user_id] = { count: 0, lastUpdate: null };
    convByUser[c.user_id].count++;
    if (!convByUser[c.user_id].lastUpdate || c.updated_at > convByUser[c.user_id].lastUpdate!) {
      convByUser[c.user_id].lastUpdate = c.updated_at;
    }
  }

  // Messages by conversation, then aggregate user message count
  const convToUser: Record<string, string> = {};
  for (const c of (convs || []) as Array<{ id: string; user_id: string }>) {
    convToUser[c.id] = c.user_id;
  }
  const userMessagesCount: Record<string, number> = {};
  const lastActivity: Record<string, string> = {};
  for (const m of (messages || []) as Array<{ conversation_id: string; role: string; created_at: string }>) {
    const uid = convToUser[m.conversation_id];
    if (!uid) continue;
    if (m.role === "user") {
      userMessagesCount[uid] = (userMessagesCount[uid] || 0) + 1;
    }
    if (!lastActivity[uid] || m.created_at > lastActivity[uid]) {
      lastActivity[uid] = m.created_at;
    }
  }

  // Determine user level based on activity
  const getLevel = (msgCount: number, sourceCount: number): "Principiante" | "Intermedio" | "Avanzato" => {
    if (msgCount < 5 && sourceCount < 2) return "Principiante";
    if (msgCount < 30 && sourceCount < 5) return "Intermedio";
    return "Avanzato";
  };

  const users = (profiles || []).map(p => {
    const sourceStats = sourcesByUser[p.id] || { count: 0, pages: 0, chapters: 0 };
    const msgCount = userMessagesCount[p.id] || 0;
    return {
      id: p.id,
      displayName: p.display_name || "Senza nome",
      language: p.language,
      onboardingCompleted: p.onboarding_completed,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      lastActivity: lastActivity[p.id] || convByUser[p.id]?.lastUpdate || p.updated_at,
      sourcesCount: sourceStats.count,
      chaptersCount: sourceStats.chapters,
      pagesCount: sourceStats.pages,
      flashcardsCount: flashcardsCount[p.id] || 0,
      quizzesCount: quizzesCount[p.id] || 0,
      summariesCount: summariesCount[p.id] || 0,
      mindmapsCount: mindmapsCount[p.id] || 0,
      presentationsCount: presentationsCount[p.id] || 0,
      infographicsCount: infographicsCount[p.id] || 0,
      conversationsCount: convByUser[p.id]?.count || 0,
      messagesCount: msgCount,
      level: getLevel(msgCount, sourceStats.count),
    };
  });

  return NextResponse.json({ users });
}

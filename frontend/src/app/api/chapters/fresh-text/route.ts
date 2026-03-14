import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { chapterId } = await request.json();

    if (!chapterId) {
      return NextResponse.json({ error: "Missing chapterId" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data, error } = await supabase
      .from("chapters")
      .select("processed_text")
      .eq("id", chapterId)
      .single();

    if (error) {
      console.error("Error fetching chapter text:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data?.processed_text) {
      return NextResponse.json({ error: "No processed text found" }, { status: 404 });
    }

    return NextResponse.json({ processed_text: data.processed_text });
  } catch (err) {
    console.error("Fresh text API error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

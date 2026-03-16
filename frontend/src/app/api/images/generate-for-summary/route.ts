import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  try {
    const body = await request.json();
    const { sourceId, userId, cleanupOnly, saveImages } = body;

    if (!sourceId || !userId) {
      return NextResponse.json(
        { error: "Missing sourceId or userId" },
        { status: 400 }
      );
    }

    // Verify source belongs to user
    const { data: source } = await supabase
      .from("sources")
      .select("id, user_id")
      .eq("id", sourceId)
      .single();

    if (!source || source.user_id !== userId) {
      return NextResponse.json({ error: "Source not found" }, { status: 404 });
    }

    // Helper: delete existing images
    const cleanupExisting = async () => {
      const { data: existingImages } = await supabase
        .from("summary_images")
        .select("id")
        .eq("source_id", sourceId);

      if (existingImages && existingImages.length > 0) {
        const paths = existingImages.map((img) => `${sourceId}/${img.id}.png`);
        // Also try numbered paths
        for (let i = 0; i < 10; i++) paths.push(`${sourceId}/${i}.png`);
        await supabase.storage.from("summary-images").remove(paths);
        await supabase.from("summary_images").delete().eq("source_id", sourceId);
      }
    };

    // Mode 1: Cleanup only
    if (cleanupOnly) {
      await cleanupExisting();
      return NextResponse.json({ success: true, message: "Cleanup done" });
    }

    // Mode 2: Save pre-generated images
    if (saveImages && Array.isArray(saveImages)) {
      await cleanupExisting();

      const savedImages: Array<{
        id: string;
        title: string;
        description: string;
        image_url: string;
        position_index: number;
        anchor_text: string | null;
      }> = [];

      for (const img of saveImages) {
        try {
          // Upload base64 to Supabase Storage
          const imageBuffer = Buffer.from(img.base64, "base64");
          const imagePath = `${sourceId}/${img.position_index}.png`;

          const { error: uploadError } = await supabase.storage
            .from("summary-images")
            .upload(imagePath, imageBuffer, {
              contentType: "image/png",
              upsert: true,
            });

          if (uploadError) {
            console.error(`Upload failed for ${imagePath}:`, uploadError);
            continue;
          }

          // Get public URL
          const { data: urlData } = supabase.storage
            .from("summary-images")
            .getPublicUrl(imagePath);

          // Save metadata to DB
          const { data: dbRow, error: dbError } = await supabase
            .from("summary_images")
            .insert({
              source_id: sourceId,
              title: img.title,
              description: img.description,
              image_url: urlData.publicUrl,
              position_index: img.position_index,
              anchor_text: img.anchor_text || null,
            })
            .select()
            .single();

          if (dbError) {
            console.error(`DB insert failed:`, dbError);
            continue;
          }

          savedImages.push(dbRow);
        } catch (err) {
          console.error(`Failed to save image ${img.position_index}:`, err);
        }
      }

      return NextResponse.json({
        success: true,
        images: savedImages,
        total: savedImages.length,
      });
    }

    return NextResponse.json(
      { error: "Invalid request. Use cleanupOnly or saveImages." },
      { status: 400 }
    );
  } catch (error) {
    console.error("Summary image API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}

// GET: Fetch existing images for a source
export async function GET(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const sourceId = request.nextUrl.searchParams.get("sourceId");
  if (!sourceId) {
    return NextResponse.json({ error: "Missing sourceId" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("summary_images")
    .select("*")
    .eq("source_id", sourceId)
    .order("position_index");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ images: data || [] });
}

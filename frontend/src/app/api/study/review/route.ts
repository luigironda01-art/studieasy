import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { fsrs, Rating, State, createEmptyCard, Card } from "ts-fsrs";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Initialize FSRS with default parameters
const f = fsrs();

export async function POST(request: NextRequest) {
  try {
    const { reviewId, flashcardId, userId, rating } = await request.json();

    if (!reviewId || !flashcardId || !userId || rating === undefined) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (rating < 1 || rating > 4) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 4" },
        { status: 400 }
      );
    }

    // Get current review state
    const { data: review, error: reviewError } = await supabase
      .from("reviews")
      .select("*")
      .eq("id", reviewId)
      .eq("user_id", userId)
      .single();

    if (reviewError || !review) {
      return NextResponse.json(
        { error: "Review not found" },
        { status: 404 }
      );
    }

    // Create card from database state
    const baseCard = createEmptyCard();
    const card: Card = {
      ...baseCard,
      due: new Date(review.due),
      stability: review.stability || 0,
      difficulty: review.difficulty || 0,
      elapsed_days: review.elapsed_days || 0,
      scheduled_days: review.scheduled_days || 0,
      reps: review.reps || 0,
      lapses: review.lapses || 0,
      state: (review.state || 0) as State,
      last_review: review.last_review ? new Date(review.last_review) : undefined,
    };

    // Apply FSRS algorithm
    const now = new Date();
    const schedulingResult = f.repeat(card, now);

    // Map rating to FSRS Rating enum and get result (1=Again, 2=Hard, 3=Good, 4=Easy)
    const ratingMap: Record<number, Rating> = {
      1: Rating.Again,
      2: Rating.Hard,
      3: Rating.Good,
      4: Rating.Easy,
    };
    const fsrsRating = ratingMap[rating];

    // Get the result for the selected rating
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedCard = (schedulingResult as any)[fsrsRating].card;

    // Update database
    const { error: updateError } = await supabase
      .from("reviews")
      .update({
        due: updatedCard.due.toISOString(),
        stability: updatedCard.stability,
        difficulty: updatedCard.difficulty,
        elapsed_days: updatedCard.elapsed_days,
        scheduled_days: updatedCard.scheduled_days,
        reps: updatedCard.reps,
        lapses: updatedCard.lapses,
        state: updatedCard.state,
        last_review: now.toISOString(),
      })
      .eq("id", reviewId);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      success: true,
      next_due: updatedCard.due.toISOString(),
      scheduled_days: updatedCard.scheduled_days,
      message: `Review recorded. Next due in ${updatedCard.scheduled_days} days.`,
    });
  } catch (error) {
    console.error("Review error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Review failed" },
      { status: 500 }
    );
  }
}

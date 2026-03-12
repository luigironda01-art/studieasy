"""
Study Router - API endpoints for spaced repetition study sessions
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from supabase import create_client, Client
from services.fsrs_service import get_fsrs_service
from config import get_settings

router = APIRouter()


def get_supabase() -> Client:
    """Get Supabase client."""
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_anon_key)


class DueCard(BaseModel):
    flashcard_id: str
    front: str
    back: str
    chapter_title: str
    source_title: str
    is_new: bool
    due: str
    state: int


class GetDueCardsResponse(BaseModel):
    cards: List[DueCard]
    stats: dict


@router.get("/due/{user_id}", response_model=GetDueCardsResponse)
async def get_due_cards(user_id: str, limit: int = 20):
    """
    Get flashcards due for review.
    """
    supabase = get_supabase()
    fsrs_service = get_fsrs_service()

    # Get all reviews for user with flashcard and chapter info
    result = supabase.table("reviews")\
        .select("*, flashcards(id, front, back, chapter_id, chapters(title, source_id, sources(title)))")\
        .eq("user_id", user_id)\
        .execute()

    if not result.data:
        return GetDueCardsResponse(cards=[], stats={
            "total_cards": 0,
            "due_today": 0,
            "new_cards": 0
        })

    # Convert to FSRS format and filter due cards
    all_cards = []
    for review in result.data:
        flashcard = review.get("flashcards", {})
        if not flashcard:
            continue

        chapter = flashcard.get("chapters", {})
        source = chapter.get("sources", {}) if chapter else {}

        card_data = {
            "due": review["due"],
            "stability": review["stability"],
            "difficulty": review["difficulty"],
            "elapsed_days": review["elapsed_days"],
            "scheduled_days": review["scheduled_days"],
            "reps": review["reps"],
            "lapses": review["lapses"],
            "state": review["state"],
            "last_review": review["last_review"],
            # Extra info
            "flashcard_id": flashcard["id"],
            "front": flashcard["front"],
            "back": flashcard["back"],
            "chapter_title": chapter.get("title", "Unknown"),
            "source_title": source.get("title", "Unknown")
        }
        all_cards.append(card_data)

    # Get due cards using FSRS
    due_cards = fsrs_service.get_cards_due(all_cards)[:limit]

    # Calculate stats
    stats = fsrs_service.get_study_stats(all_cards)

    # Format response
    cards = [
        DueCard(
            flashcard_id=card["flashcard_id"],
            front=card["front"],
            back=card["back"],
            chapter_title=card["chapter_title"],
            source_title=card["source_title"],
            is_new=card.get("is_new", False),
            due=card["due"] if card["due"] else datetime.now(timezone.utc).isoformat(),
            state=card["state"]
        )
        for card in due_cards
    ]

    return GetDueCardsResponse(cards=cards, stats=stats)


class ReviewRequest(BaseModel):
    flashcard_id: str
    user_id: str
    rating: int  # 1=Again, 2=Hard, 3=Good, 4=Easy


class ReviewResponse(BaseModel):
    success: bool
    next_due: str
    message: str


@router.post("/review", response_model=ReviewResponse)
async def submit_review(request: ReviewRequest):
    """
    Submit a review for a flashcard and update FSRS state.
    """
    if request.rating < 1 or request.rating > 4:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 4")

    supabase = get_supabase()
    fsrs_service = get_fsrs_service()

    # Get current review state
    review_result = supabase.table("reviews")\
        .select("*")\
        .eq("flashcard_id", request.flashcard_id)\
        .eq("user_id", request.user_id)\
        .single()\
        .execute()

    if not review_result.data:
        raise HTTPException(status_code=404, detail="Review record not found")

    review = review_result.data

    # Convert to FSRS card format
    card_data = {
        "due": review["due"],
        "stability": review["stability"],
        "difficulty": review["difficulty"],
        "elapsed_days": review["elapsed_days"],
        "scheduled_days": review["scheduled_days"],
        "reps": review["reps"],
        "lapses": review["lapses"],
        "state": review["state"],
        "last_review": review["last_review"]
    }

    # Apply FSRS algorithm
    updated_card = fsrs_service.review_card(card_data, request.rating)

    # Update database
    supabase.table("reviews").update({
        "due": updated_card["due"],
        "stability": updated_card["stability"],
        "difficulty": updated_card["difficulty"],
        "elapsed_days": updated_card["elapsed_days"],
        "scheduled_days": updated_card["scheduled_days"],
        "reps": updated_card["reps"],
        "lapses": updated_card["lapses"],
        "state": updated_card["state"],
        "last_review": datetime.now(timezone.utc).isoformat()
    }).eq("id", review["id"]).execute()

    # Calculate human-readable next due
    next_due = updated_card["due"]

    return ReviewResponse(
        success=True,
        next_due=next_due,
        message=f"Review recorded. Next due: {next_due}"
    )


@router.get("/stats/{user_id}")
async def get_study_stats(user_id: str):
    """
    Get study statistics for a user.
    """
    supabase = get_supabase()
    fsrs_service = get_fsrs_service()

    # Get all reviews
    result = supabase.table("reviews")\
        .select("*")\
        .eq("user_id", user_id)\
        .execute()

    if not result.data:
        return {
            "total_cards": 0,
            "new_cards": 0,
            "learning_cards": 0,
            "review_cards": 0,
            "due_today": 0,
            "due_tomorrow": 0,
            "average_stability": 0,
            "average_difficulty": 0
        }

    # Convert to card format
    cards = [
        {
            "due": r["due"],
            "stability": r["stability"],
            "difficulty": r["difficulty"],
            "elapsed_days": r["elapsed_days"],
            "scheduled_days": r["scheduled_days"],
            "reps": r["reps"],
            "lapses": r["lapses"],
            "state": r["state"],
            "last_review": r["last_review"]
        }
        for r in result.data
    ]

    return fsrs_service.get_study_stats(cards)

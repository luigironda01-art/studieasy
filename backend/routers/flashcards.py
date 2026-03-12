"""
Flashcards Router - API endpoints for flashcard operations
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import os
from supabase import create_client, Client
from services.openrouter_service import get_openrouter_service
from services.fsrs_service import get_fsrs_service
from config import get_settings

router = APIRouter()


def get_supabase() -> Client:
    """Get Supabase client with service role key to bypass RLS."""
    settings = get_settings()
    # Use service role key to bypass RLS for inserts
    key = settings.supabase_service_role_key or settings.supabase_anon_key
    return create_client(settings.supabase_url, key)


class GenerateFlashcardsRequest(BaseModel):
    chapter_id: str
    user_id: str
    num_cards: int = 10
    difficulty: str = "medium"
    language: str = "it"


class GenerateFlashcardsResponse(BaseModel):
    success: bool
    flashcards_created: int
    message: str


@router.post("/generate", response_model=GenerateFlashcardsResponse)
async def generate_flashcards(request: GenerateFlashcardsRequest):
    """
    Generate flashcards from a chapter's processed text.
    """
    supabase = get_supabase()
    ai_service = get_openrouter_service()
    fsrs_service = get_fsrs_service()

    # Get chapter with processed text
    chapter_result = supabase.table("chapters").select("*").eq("id", request.chapter_id).single().execute()

    if not chapter_result.data:
        raise HTTPException(status_code=404, detail="Chapter not found")

    chapter = chapter_result.data

    if not chapter.get("processed_text"):
        raise HTTPException(status_code=400, detail="Chapter has not been processed yet")

    # Generate flashcards using AI
    try:
        flashcards = await ai_service.generate_flashcards(
            text=chapter["processed_text"],
            num_cards=request.num_cards,
            language=request.language,
            difficulty=request.difficulty
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

    # Save flashcards to database
    created_count = 0
    for card in flashcards:
        # Insert flashcard
        flashcard_result = supabase.table("flashcards").insert({
            "chapter_id": request.chapter_id,
            "user_id": request.user_id,
            "front": card["front"],
            "back": card["back"],
            "ai_generated": True
        }).execute()

        if flashcard_result.data:
            flashcard_id = flashcard_result.data[0]["id"]

            # Create initial FSRS review state
            initial_state = fsrs_service.create_new_card()
            supabase.table("reviews").insert({
                "flashcard_id": flashcard_id,
                "user_id": request.user_id,
                "difficulty": initial_state["difficulty"],
                "stability": initial_state["stability"],
                "elapsed_days": initial_state["elapsed_days"],
                "scheduled_days": initial_state["scheduled_days"],
                "reps": initial_state["reps"],
                "lapses": initial_state["lapses"],
                "state": initial_state["state"],
                "due": initial_state["due"]
            }).execute()

            created_count += 1

    return GenerateFlashcardsResponse(
        success=True,
        flashcards_created=created_count,
        message=f"Generated {created_count} flashcards successfully"
    )


class FlashcardResponse(BaseModel):
    id: str
    chapter_id: str
    front: str
    back: str
    ai_generated: bool
    created_at: str


@router.get("/chapter/{chapter_id}")
async def get_chapter_flashcards(chapter_id: str, user_id: str):
    """
    Get all flashcards for a chapter.
    """
    supabase = get_supabase()

    result = supabase.table("flashcards")\
        .select("*")\
        .eq("chapter_id", chapter_id)\
        .eq("user_id", user_id)\
        .order("created_at", desc=False)\
        .execute()

    return {"flashcards": result.data or []}


@router.delete("/{flashcard_id}")
async def delete_flashcard(flashcard_id: str, user_id: str):
    """
    Delete a flashcard.
    """
    supabase = get_supabase()

    # Verify ownership
    check = supabase.table("flashcards")\
        .select("id")\
        .eq("id", flashcard_id)\
        .eq("user_id", user_id)\
        .single()\
        .execute()

    if not check.data:
        raise HTTPException(status_code=404, detail="Flashcard not found")

    # Delete (reviews will cascade)
    supabase.table("flashcards").delete().eq("id", flashcard_id).execute()

    return {"success": True, "message": "Flashcard deleted"}

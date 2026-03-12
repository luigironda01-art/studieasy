"""
FSRS Service - Spaced Repetition Scheduling
Implements the Free Spaced Repetition Scheduler algorithm.
"""
from fsrs import Scheduler as FSRS, Card, Rating, State
from datetime import datetime, timezone
from typing import Optional


class FSRSService:
    """Service for spaced repetition scheduling using FSRS algorithm."""

    def __init__(self):
        self.fsrs = FSRS()

    def create_new_card(self) -> dict:
        """
        Create a new card with initial state.

        Returns:
            Card state dict
        """
        card = Card()
        return self._card_to_dict(card)

    def review_card(
        self,
        card_data: dict,
        rating: int,
        review_time: Optional[datetime] = None
    ) -> dict:
        """
        Review a card and get next scheduling.

        Args:
            card_data: Current card state
            rating: User rating (1=Again, 2=Hard, 3=Good, 4=Easy)
            review_time: Time of review (defaults to now)

        Returns:
            Updated card state with next review date
        """
        if review_time is None:
            review_time = datetime.now(timezone.utc)

        # Convert rating int to Rating enum
        rating_map = {
            1: Rating.Again,
            2: Rating.Hard,
            3: Rating.Good,
            4: Rating.Easy
        }
        fsrs_rating = rating_map.get(rating, Rating.Good)

        # Reconstruct card from dict
        card = self._dict_to_card(card_data)

        # Apply FSRS algorithm
        card, review_log = self.fsrs.review_card(card, fsrs_rating, review_time)

        return self._card_to_dict(card)

    def get_cards_due(
        self,
        cards: list[dict],
        current_time: Optional[datetime] = None
    ) -> list[dict]:
        """
        Filter cards that are due for review.

        Args:
            cards: List of card state dicts
            current_time: Current time (defaults to now)

        Returns:
            List of cards due for review, sorted by priority
        """
        if current_time is None:
            current_time = datetime.now(timezone.utc)

        due_cards = []
        for card_data in cards:
            card = self._dict_to_card(card_data)

            # New cards are always due
            if card.state == State.New:
                due_cards.append({
                    **card_data,
                    "priority": 0,  # New cards have highest priority
                    "is_new": True
                })
            # Learning/Relearning cards
            elif card.state in [State.Learning, State.Relearning]:
                if card.due <= current_time:
                    due_cards.append({
                        **card_data,
                        "priority": 1,
                        "is_new": False
                    })
            # Review cards
            elif card.state == State.Review:
                if card.due <= current_time:
                    # Calculate overdue priority
                    overdue_days = (current_time - card.due).days
                    due_cards.append({
                        **card_data,
                        "priority": 2 + overdue_days,
                        "is_new": False
                    })

        # Sort by priority (lower = higher priority)
        due_cards.sort(key=lambda x: x["priority"])

        return due_cards

    def get_study_stats(self, cards: list[dict]) -> dict:
        """
        Calculate study statistics from cards.

        Args:
            cards: List of card state dicts

        Returns:
            Statistics dict
        """
        now = datetime.now(timezone.utc)

        stats = {
            "total_cards": len(cards),
            "new_cards": 0,
            "learning_cards": 0,
            "review_cards": 0,
            "due_today": 0,
            "due_tomorrow": 0,
            "average_stability": 0.0,
            "average_difficulty": 0.0
        }

        total_stability = 0.0
        total_difficulty = 0.0
        cards_with_stats = 0

        for card_data in cards:
            card = self._dict_to_card(card_data)

            # Count by state
            if card.state == State.New:
                stats["new_cards"] += 1
            elif card.state in [State.Learning, State.Relearning]:
                stats["learning_cards"] += 1
            else:
                stats["review_cards"] += 1

            # Count due
            if card.due <= now:
                stats["due_today"] += 1
            elif (card.due - now).days <= 1:
                stats["due_tomorrow"] += 1

            # Accumulate for averages
            if card.stability > 0:
                total_stability += card.stability
                total_difficulty += card.difficulty
                cards_with_stats += 1

        # Calculate averages
        if cards_with_stats > 0:
            stats["average_stability"] = round(total_stability / cards_with_stats, 2)
            stats["average_difficulty"] = round(total_difficulty / cards_with_stats, 2)

        return stats

    def _card_to_dict(self, card: Card) -> dict:
        """Convert FSRS Card to dict for storage."""
        return {
            "due": card.due.isoformat() if card.due else None,
            "stability": card.stability,
            "difficulty": card.difficulty,
            "elapsed_days": card.elapsed_days,
            "scheduled_days": card.scheduled_days,
            "reps": card.reps,
            "lapses": card.lapses,
            "state": card.state.value,
            "last_review": card.last_review.isoformat() if card.last_review else None
        }

    def _dict_to_card(self, data: dict) -> Card:
        """Convert dict to FSRS Card."""
        card = Card()

        if data.get("due"):
            due = data["due"]
            if isinstance(due, str):
                card.due = datetime.fromisoformat(due.replace("Z", "+00:00"))
            else:
                card.due = due

        card.stability = data.get("stability", 0.0)
        card.difficulty = data.get("difficulty", 0.0)
        card.elapsed_days = data.get("elapsed_days", 0)
        card.scheduled_days = data.get("scheduled_days", 0)
        card.reps = data.get("reps", 0)
        card.lapses = data.get("lapses", 0)

        state_value = data.get("state", 0)
        card.state = State(state_value) if isinstance(state_value, int) else State.New

        if data.get("last_review"):
            last_review = data["last_review"]
            if isinstance(last_review, str):
                card.last_review = datetime.fromisoformat(last_review.replace("Z", "+00:00"))
            else:
                card.last_review = last_review

        return card


# Singleton instance
_fsrs_service: Optional[FSRSService] = None


def get_fsrs_service() -> FSRSService:
    """Get or create FSRS service instance."""
    global _fsrs_service
    if _fsrs_service is None:
        _fsrs_service = FSRSService()
    return _fsrs_service

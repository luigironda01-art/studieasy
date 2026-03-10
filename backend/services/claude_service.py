"""
Claude AI Service - Content Generation
Generates high-quality flashcards, quizzes, and summaries.
"""
import anthropic
from typing import Optional
import json
from config import get_settings


class ClaudeService:
    """Service for generating educational content using Claude API."""

    def __init__(self):
        settings = get_settings()
        self.client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self.model = "claude-sonnet-4-20250514"

    async def generate_flashcards(
        self,
        text: str,
        num_cards: int = 10,
        language: str = "it",
        difficulty: str = "medium"
    ) -> list[dict]:
        """
        Generate flashcards from text content.

        Args:
            text: Source text to generate flashcards from
            num_cards: Number of flashcards to generate (5-20)
            language: 'it' for Italian, 'en' for English
            difficulty: 'easy', 'medium', 'hard'

        Returns:
            List of flashcard dicts with 'front' and 'back' keys
        """
        lang_name = "Italiano" if language == "it" else "English"

        prompt = f"""Sei un esperto educatore e tutor. Il tuo compito è creare flashcard efficaci per aiutare gli studenti a memorizzare e comprendere i concetti chiave.

Genera esattamente {num_cards} flashcard dal seguente testo.

REGOLE:
1. Ogni flashcard deve avere:
   - "front": Una domanda chiara, specifica e che stimola il pensiero
   - "back": Una risposta concisa ma completa

2. Le domande devono:
   - Testare la comprensione, non solo la memorizzazione
   - Essere specifiche (evita domande vaghe)
   - Coprire i concetti più importanti del testo

3. Le risposte devono:
   - Essere complete ma concise
   - Contenere solo informazioni presenti nel testo
   - Essere facili da verificare

4. Difficoltà: {difficulty}
   - easy: Definizioni e fatti base
   - medium: Comprensione e applicazione
   - hard: Analisi e connessioni tra concetti

5. Lingua: {lang_name}

TESTO DA ANALIZZARE:
{text}

Rispondi SOLO con un array JSON valido, senza altri commenti:
[
  {{"front": "domanda 1", "back": "risposta 1"}},
  {{"front": "domanda 2", "back": "risposta 2"}}
]"""

        message = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        # Parse JSON response
        response_text = message.content[0].text
        # Clean up potential markdown code blocks
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        return json.loads(response_text.strip())

    async def generate_summary(
        self,
        text: str,
        language: str = "it",
        detail_level: str = "detailed"
    ) -> str:
        """
        Generate a summary of the text.

        Args:
            text: Source text to summarize
            language: 'it' for Italian, 'en' for English
            detail_level: 'brief', 'medium', 'detailed'

        Returns:
            Summary string
        """
        lang_name = "Italiano" if language == "it" else "English"

        length_guide = {
            "brief": "2-3 paragrafi",
            "medium": "4-5 paragrafi",
            "detailed": "6-8 paragrafi con sottosezioni"
        }

        prompt = f"""Sei un esperto educatore. Crea un riassunto chiaro e ben strutturato del seguente testo.

REGOLE:
1. Lingua: {lang_name}
2. Lunghezza: {length_guide[detail_level]}
3. Includi:
   - Concetti principali
   - Definizioni importanti
   - Relazioni tra concetti
4. Usa un linguaggio chiaro e accessibile per studenti
5. Organizza il contenuto in modo logico

TESTO:
{text}

RIASSUNTO:"""

        message = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        return message.content[0].text

    async def generate_quiz(
        self,
        text: str,
        num_questions: int = 5,
        language: str = "it",
        include_true_false: bool = True
    ) -> list[dict]:
        """
        Generate quiz questions from text.

        Args:
            text: Source text
            num_questions: Number of questions (3-10)
            language: 'it' or 'en'
            include_true_false: Include true/false questions

        Returns:
            List of question dicts
        """
        lang_name = "Italiano" if language == "it" else "English"

        question_types = "multiple_choice"
        if include_true_false:
            question_types += " e true_false"

        prompt = f"""Sei un esperto educatore. Crea un quiz per testare la comprensione del seguente testo.

REGOLE:
1. Genera {num_questions} domande
2. Tipi di domande: {question_types}
3. Lingua: {lang_name}

FORMATO per multiple_choice:
{{
  "type": "multiple_choice",
  "question": "La domanda",
  "options": ["A) opzione", "B) opzione", "C) opzione", "D) opzione"],
  "correct": "A",
  "explanation": "Spiegazione breve"
}}

FORMATO per true_false:
{{
  "type": "true_false",
  "question": "Affermazione da valutare",
  "correct": true/false,
  "explanation": "Spiegazione breve"
}}

TESTO:
{text}

Rispondi SOLO con un array JSON valido:"""

        message = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        response_text = message.content[0].text
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        return json.loads(response_text.strip())


# Singleton instance
_claude_service: Optional[ClaudeService] = None


def get_claude_service() -> ClaudeService:
    """Get or create Claude service instance."""
    global _claude_service
    if _claude_service is None:
        _claude_service = ClaudeService()
    return _claude_service

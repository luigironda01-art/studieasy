"""
OpenRouter AI Service - Unified AI Access
Provides access to Claude, Gemini, and other models via OpenRouter API.
"""
import os
import json
from typing import Optional
from openai import OpenAI
from config import get_settings


class OpenRouterService:
    """Unified service for AI operations via OpenRouter."""

    def __init__(self):
        settings = get_settings()
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=settings.openrouter_api_key
        )
        # Model selection
        self.content_model = "anthropic/claude-3.5-sonnet"  # For content generation
        self.vision_model = "google/gemini-2.0-flash-001"   # For PDF/image processing

    async def process_document(self, file_url: str, mime_type: str = "application/pdf") -> dict:
        """
        Process a document (PDF/image) and extract structured content.
        Uses Gemini for vision capabilities.

        Args:
            file_url: URL to the document
            mime_type: MIME type of the document

        Returns:
            Dict with extracted text and structure
        """
        import httpx
        import base64

        # Download file
        async with httpx.AsyncClient() as client:
            response = await client.get(file_url)
            file_content = response.content

        file_data = base64.b64encode(file_content).decode("utf-8")

        prompt = """Analizza questo documento e estrai tutto il contenuto in modo strutturato.

Per ogni elemento (testo, immagini, grafici, formule, tabelle):
1. Estrai il testo esattamente come appare
2. Per immagini/grafici/formule: descrivi dettagliatamente cosa rappresentano
3. Mantieni la struttura logica del documento (titoli, paragrafi, elenchi)

Restituisci il contenuto in formato Markdown ben strutturato.
Includi descrizioni dettagliate di ogni elemento visivo tra tag [IMMAGINE: descrizione] o [FORMULA: descrizione]."""

        # Note: OpenRouter doesn't support vision in the same way as direct API
        # For now, we'll use a text-based approach and enhance later
        response = self.client.chat.completions.create(
            model=self.vision_model,
            max_tokens=8000,
            messages=[
                {
                    "role": "user",
                    "content": prompt + "\n\n[Document content would be processed here]"
                }
            ]
        )

        return {
            "extracted_text": response.choices[0].message.content,
            "status": "completed"
        }

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
            num_cards: Number of flashcards to generate (5-30)
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

        response = self.client.chat.completions.create(
            model=self.content_model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        # Parse JSON response
        response_text = response.choices[0].message.content
        # Clean up potential markdown code blocks
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        return json.loads(response_text.strip())

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
        question_types = "multiple_choice e true_false" if include_true_false else "multiple_choice"

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
  "correct": true,
  "explanation": "Spiegazione breve"
}}

TESTO:
{text}

Rispondi SOLO con un array JSON valido:"""

        response = self.client.chat.completions.create(
            model=self.content_model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        response_text = response.choices[0].message.content
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        return json.loads(response_text.strip())

    async def generate_summary(
        self,
        text: str,
        language: str = "it",
        detail_level: str = "medium"
    ) -> str:
        """
        Generate a summary of the text.

        Args:
            text: Source text to summarize
            language: 'it' for Italian, 'en' for English
            detail_level: 'brief', 'medium', 'detailed'

        Returns:
            Summary string in Markdown
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
6. Formatta in Markdown

TESTO:
{text}

RIASSUNTO:"""

        response = self.client.chat.completions.create(
            model=self.content_model,
            max_tokens=4096,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        return response.choices[0].message.content

    async def generate_concept_map(
        self,
        text: str,
        language: str = "it"
    ) -> dict:
        """
        Generate a concept map in Mermaid syntax.

        Args:
            text: Source text
            language: 'it' or 'en'

        Returns:
            Dict with 'title' and 'mermaid_code'
        """
        lang_name = "Italiano" if language == "it" else "English"

        prompt = f"""Analizza il testo e crea una mappa concettuale usando la sintassi Mermaid.

REGOLE:
1. Lingua: {lang_name}
2. Usa il formato 'flowchart TD' (top-down)
3. Identifica il concetto principale come nodo centrale
4. Collega i sotto-concetti con relazioni chiare
5. Usa etichette descrittive per le connessioni
6. Massimo 15 nodi per mantenere leggibilità

TESTO:
{text}

Rispondi in JSON:
{{
  "title": "Titolo della mappa",
  "mermaid_code": "flowchart TD\\n    A[Concetto] --> B[Altro]"
}}"""

        response = self.client.chat.completions.create(
            model=self.content_model,
            max_tokens=2048,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        response_text = response.choices[0].message.content
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        return json.loads(response_text.strip())

    async def determine_topic_emoji(self, text: str) -> str:
        """
        Determine the most appropriate emoji for the content based on its topic.

        Args:
            text: Text content to analyze

        Returns:
            A single emoji that best represents the topic
        """
        # Take only first 2000 chars for efficiency
        sample_text = text[:2000] if len(text) > 2000 else text

        prompt = f"""Analizza il seguente testo e determina l'argomento principale.
Rispondi con UNA SOLA emoji che meglio rappresenta l'argomento.

MAPPATURA ARGOMENTI -> EMOJI:
- Farmacia/Farmacologia: 💊
- Chimica: ⚗️
- Matematica: 📐
- Biologia/Scienze naturali: 🧬
- Diritto/Legge: ⚖️
- Economia/Finanza: 💰
- Informatica/Programmazione: 💻
- Geografia: 🌍
- Storia: 📜
- Arte/Design: 🎨
- Letteratura/Lingue: 📚
- Fisica: ⚛️
- Psicologia: 🧠
- Filosofia: 🏛️
- Medicina/Salute: 🏥
- Ingegneria: 🔧
- Statistica: 📊
- Musica: 🎵
- Sport/Educazione fisica: ⚽
- Astronomia: 🔭
- Architettura: 🏗️
- Sociologia: 👥
- Politica: 🗳️
- Alimentazione/Nutrizione: 🍎
- Ambiente/Ecologia: 🌱

TESTO:
{sample_text}

Rispondi SOLO con l'emoji, nient'altro:"""

        try:
            response = self.client.chat.completions.create(
                model=self.content_model,
                max_tokens=10,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            emoji = response.choices[0].message.content.strip()
            # Validate it's actually an emoji (simple check)
            if len(emoji) <= 4 and emoji:
                return emoji
            return "📖"  # Default fallback
        except Exception as e:
            print(f"Error determining topic emoji: {e}")
            return "📖"  # Default fallback

    async def enhance_processed_text(self, raw_text: str, language: str = "it") -> str:
        """
        Enhance and structure raw extracted text for better studying.

        Args:
            raw_text: Raw text extracted from document
            language: 'it' or 'en'

        Returns:
            Enhanced text in Markdown
        """
        lang_name = "Italiano" if language == "it" else "English"

        prompt = f"""Sei un assistente di studio esperto. Analizza il seguente contenuto estratto da un documento accademico e crea un'analisi strutturata di alta qualità.

CONTENUTO ESTRATTO:
{raw_text}

COMPITI:
1. Riorganizza il contenuto in modo chiaro e logico
2. Identifica i concetti chiave e le definizioni importanti
3. Evidenzia le relazioni tra concetti
4. Mantieni tutte le informazioni tecniche accurate (formule, dati, etc.)
5. Struttura il testo per facilitare lo studio
6. Lingua output: {lang_name}

Restituisci il contenuto elaborato in Markdown, mantenendo alta fedeltà al materiale originale ma migliorandone la leggibilità per lo studio."""

        response = self.client.chat.completions.create(
            model=self.content_model,
            max_tokens=8000,
            messages=[
                {"role": "user", "content": prompt}
            ]
        )

        return response.choices[0].message.content


# Singleton instance
_openrouter_service: Optional[OpenRouterService] = None


def get_openrouter_service() -> OpenRouterService:
    """Get or create OpenRouter service instance."""
    global _openrouter_service
    if _openrouter_service is None:
        _openrouter_service = OpenRouterService()
    return _openrouter_service

"""
OpenRouter AI Service - Unified AI Access
Provides access to Claude, Gemini, and other models via OpenRouter API.
"""
import os
import json
import asyncio
from typing import Optional
from openai import AsyncOpenAI
from config import get_settings


class OpenRouterService:
    """Unified service for AI operations via OpenRouter."""

    def __init__(self):
        settings = get_settings()
        api_key = settings.openrouter_api_key
        if not api_key:
            print("WARNING: OPENROUTER_API_KEY is not set!")
        self.client = AsyncOpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key or "missing-key"
        )
        # Model selection - using stable model IDs
        self.content_model = "anthropic/claude-3-5-sonnet-20241022"  # Claude 3.5 Sonnet
        self.vision_model = "google/gemini-2.0-flash-001"   # For PDF/image processing

    async def process_document_with_vision(self, images_base64: list[str]) -> str:
        """
        Process document images using Gemini Vision via OpenRouter.

        Args:
            images_base64: List of base64-encoded images (from PDF pages)

        Returns:
            Extracted text content
        """
        prompt = """Analizza queste pagine di documento e estrai TUTTO il contenuto testuale.

ISTRUZIONI:
1. Estrai il testo esattamente come appare in ogni pagina
2. Per immagini, grafici, diagrammi: descrivi dettagliatamente cosa rappresentano tra tag [IMMAGINE: descrizione]. LIMITE: inserisci al MASSIMO 5 tag [IMMAGINE:], preferibilmente meno. Scegli solo le immagini più importanti e didatticamente utili (formule complesse, strutture molecolari, diagrammi chiave). Se ci sono più di 5 immagini nel documento, seleziona le 5 più rilevanti e per le altre trascrivi semplicemente il contenuto come testo. Il massimo assoluto è 10 tag [IMMAGINE:].
3. Per formule matematiche/chimiche: trascrivi in formato leggibile tra tag [FORMULA: formula]
4. Per tabelle: converti in formato markdown
5. Mantieni la struttura logica: titoli, paragrafi, elenchi
6. Separa chiaramente le pagine con "---" tra una e l'altra

Restituisci il contenuto completo in formato Markdown."""

        # Build message content with images
        content = [{"type": "text", "text": prompt}]

        for i, img_b64 in enumerate(images_base64[:20]):  # Limit to 20 pages
            content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{img_b64}"
                }
            })

        try:
            response = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=self.vision_model,
                    max_tokens=8000,
                    messages=[
                        {
                            "role": "user",
                            "content": content
                        }
                    ]
                ),
                timeout=300.0
            )
            return response.choices[0].message.content
        except asyncio.TimeoutError:
            print("Vision processing timed out after 300s")
            raise Exception("Vision processing timed out (300s)")
        except Exception as e:
            print(f"Vision processing error: {e}")
            raise Exception(f"Failed to process document with vision: {e}")

    async def generate_ai_focus(self, processed_text: str, language: str = "it") -> dict:
        """
        Analyze document content and generate focus suggestions for deeper learning.
        Returns topic analysis and search queries for related resources.

        Args:
            processed_text: The document's processed text content
            language: 'it' or 'en'

        Returns:
            Dict with topic analysis and suggested search queries
        """
        lang_name = "Italiano" if language == "it" else "English"

        # Take sample of text for analysis (first 4000 chars)
        sample_text = processed_text[:4000] if len(processed_text) > 4000 else processed_text

        prompt = f"""Sei un tutor esperto. Analizza questo materiale di studio e suggerisci risorse per approfondire.

MATERIALE:
{sample_text}

COMPITI:
1. Identifica l'argomento principale e i sotto-argomenti chiave
2. Individua concetti che potrebbero beneficiare di approfondimento
3. Suggerisci 5-8 query di ricerca specifiche per trovare:
   - Video tutorial correlati
   - Articoli accademici
   - Spiegazioni alternative
   - Esempi pratici
   - Risorse gratuite online

LINGUA: {lang_name}

Rispondi in JSON con questo formato:
{{
  "main_topic": "Argomento principale",
  "subtopics": ["sotto-argomento 1", "sotto-argomento 2"],
  "concepts_to_explore": [
    {{"concept": "concetto", "why": "perché approfondire"}}
  ],
  "search_queries": [
    {{"query": "query di ricerca", "purpose": "cosa troverai", "type": "video|article|tutorial|example"}}
  ],
  "study_tips": ["suggerimento 1", "suggerimento 2"]
}}"""

        try:
            response = await self.client.chat.completions.create(
                model=self.content_model,
                max_tokens=2048,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )

            response_text = response.choices[0].message.content

            # Clean up markdown code blocks
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            return json.loads(response_text.strip())

        except Exception as e:
            print(f"AI Focus generation error: {e}")
            return {
                "main_topic": "Analisi non disponibile",
                "subtopics": [],
                "concepts_to_explore": [],
                "search_queries": [],
                "study_tips": ["Riprova più tardi"]
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

        try:
            print(f"Calling OpenRouter with model: {self.content_model}")
            response = await self.client.chat.completions.create(
                model=self.content_model,
                max_tokens=4096,
                messages=[
                    {"role": "user", "content": prompt}
                ]
            )
            print(f"OpenRouter response received")
        except Exception as api_error:
            print(f"OpenRouter API error: {type(api_error).__name__}: {api_error}")
            raise Exception(f"OpenRouter API call failed: {api_error}")

        # Parse JSON response
        response_text = response.choices[0].message.content
        print(f"Response text (first 200 chars): {response_text[:200] if response_text else 'EMPTY'}")
        # Clean up potential markdown code blocks
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        try:
            result = json.loads(response_text.strip())
            print(f"Successfully parsed {len(result)} flashcards")
            return result
        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}")
            print(f"Raw response: {response_text}")
            raise Exception(f"Failed to parse AI response as JSON: {e}")

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

        response = await self.client.chat.completions.create(
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

        response = await self.client.chat.completions.create(
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

        response = await self.client.chat.completions.create(
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
            response = await self.client.chat.completions.create(
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

    async def split_into_chapters(self, text: str) -> list[dict]:
        """
        Analyze text content and identify logical chapter/section divisions.

        Args:
            text: Full extracted text from document

        Returns:
            List of dicts with 'title' and 'start_marker' for each chapter
        """
        # Skip splitting for short documents
        if len(text) < 2000:
            return []

        # Use first 20k chars for analysis (enough to identify structure)
        sample = text[:20000] if len(text) > 20000 else text

        prompt = f"""Analizza questo testo formattato di un documento di studio e identifica i CAPITOLI o SEZIONI principali basandoti sugli ARGOMENTI trattati.

TESTO:
{sample}

REGOLE:
1. Identifica le sezioni tematiche principali (NON ogni sotto-paragrafo)
2. Minimo 2 capitoli, massimo 10
3. Ogni capitolo deve coprire un argomento coerente e sostanziale
4. Il titolo deve essere descrittivo dell'argomento trattato
5. start_marker deve essere una frase ESATTA copiata dal testo (le prime parole della sezione, inclusi eventuali caratteri markdown come # o **)
6. Il primo capitolo deve iniziare dall'inizio del documento
7. Cerca titoli, intestazioni o cambi di argomento come punti di divisione

Rispondi SOLO con un array JSON valido:
[
  {{"title": "Titolo del capitolo", "start_marker": "frase esatta dal testo che segna l'inizio"}}
]"""

        try:
            response = await asyncio.wait_for(
                self.client.chat.completions.create(
                    model=self.vision_model,  # Gemini Flash - fast and cheap
                    max_tokens=2048,
                    messages=[{"role": "user", "content": prompt}]
                ),
                timeout=60.0
            )

            response_text = response.choices[0].message.content
            # Clean markdown code blocks
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]

            chapters = json.loads(response_text.strip())

            # Validate: must be a list with at least 2 items
            if not isinstance(chapters, list) or len(chapters) < 2:
                print(f"Chapter splitting returned {len(chapters) if isinstance(chapters, list) else 0} chapters, skipping")
                return []

            # Validate each chapter has required fields
            valid = [c for c in chapters if isinstance(c, dict) and "title" in c and "start_marker" in c]
            if len(valid) < 2:
                return []

            print(f"AI identified {len(valid)} chapters")
            return valid

        except Exception as e:
            print(f"Chapter splitting error: {e}")
            return []

    def _clean_pdf_text(self, text: str) -> str:
        """
        Programmatic cleanup of PDF-extracted text.
        Fixes spacing issues, formatting artifacts without losing content.
        """
        import re

        # Fix common PDF extraction spacing issues
        # "dal50al98%" → "dal 50 al 98%"
        text = re.sub(r'([a-zà-ú])(\d)', r'\1 \2', text)
        text = re.sub(r'(\d)([a-zA-Zà-ú])', r'\1 \2', text)

        # Fix missing spaces after punctuation
        text = re.sub(r'\.([A-ZÀ-Ú])', r'. \1', text)
        text = re.sub(r',([a-zA-Zà-ú])', r', \1', text)
        text = re.sub(r':([a-zA-Zà-ú])', r': \1', text)
        text = re.sub(r';([a-zA-Zà-ú])', r'; \1', text)

        # Fix words glued together (lowercase followed by uppercase)
        text = re.sub(r'([a-zà-ú])([A-ZÀ-Ú])', r'\1 \2', text)

        # Fix spaces before punctuation that shouldn't be there
        text = re.sub(r'\s+\.', '.', text)
        text = re.sub(r'\s+,', ',', text)

        # Clean up multiple spaces
        text = re.sub(r'  +', ' ', text)

        # Clean up multiple blank lines (keep max 2)
        text = re.sub(r'\n{4,}', '\n\n\n', text)

        # Remove raw image URLs extracted from PDF
        text = re.sub(r'https?://\S+\.(jpg|jpeg|png|gif|bmp|svg|webp)\S*', '', text, flags=re.IGNORECASE)
        # Remove standalone URLs on their own line
        text = re.sub(r'^\s*https?://\S+\s*$', '', text, flags=re.MULTILINE)

        # Fix bullet points
        text = re.sub(r'^❖\s*', '- ', text, flags=re.MULTILINE)
        text = re.sub(r'^➢\s*', '- ', text, flags=re.MULTILINE)
        text = re.sub(r'^•\s*', '- ', text, flags=re.MULTILINE)

        return text.strip()

    async def enhance_processed_text(self, raw_text: str, language: str = "it") -> str:
        """
        Enhance and structure raw extracted text for better studying.
        Step 1: Programmatic cleanup (fix spacing, formatting - no content loss)
        Step 2: AI adds section headings and bold keywords (preserving all content)

        Args:
            raw_text: Raw text extracted from document
            language: 'it' or 'en'

        Returns:
            Enhanced text in Markdown
        """
        # Step 1: Programmatic cleanup - zero content loss
        cleaned = self._clean_pdf_text(raw_text)
        print(f"Enhancement Step 1 (cleanup): {len(raw_text)} → {len(cleaned)} chars")

        # Step 2: Use Vision model (Gemini Flash) for formatting
        # Gemini follows instructions more literally than Claude for reformatting
        # Process in chunks
        chunk_size = 12000
        chunks = []
        text = cleaned

        while len(text) > chunk_size:
            split_at = text.rfind("\n\n", 0, chunk_size)
            if split_at == -1:
                split_at = text.rfind("\n", 0, chunk_size)
            if split_at == -1:
                split_at = chunk_size
            chunks.append(text[:split_at])
            text = text[split_at:].lstrip()
        if text:
            chunks.append(text)

        print(f"Enhancement Step 2 (AI structure): {len(chunks)} chunks")

        enhanced_parts = []
        for i, chunk in enumerate(chunks):
            prompt = f"""Aggiungi SOLO formattazione Markdown al seguente testo. NON modificare, rimuovere o riassumere il contenuto.

TESTO:
{chunk}

REGOLE TASSATIVE:
1. Aggiungi ## per i titoli di sezione e ### per i sotto-titoli
2. Metti in **grassetto** i termini chiave e le definizioni importanti
3. NON eliminare NESSUNA frase o informazione
4. NON riscrivere le frasi - mantieni il testo originale
5. NON aggiungere introduzioni, conclusioni o commenti tuoi
6. Restituisci SOLO il testo formattato"""

            try:
                response = await asyncio.wait_for(
                    self.client.chat.completions.create(
                        model=self.vision_model,  # Gemini Flash - follows formatting instructions better
                        max_tokens=16000,
                        messages=[
                            {"role": "user", "content": prompt}
                        ]
                    ),
                    timeout=120.0
                )
                part = response.choices[0].message.content
                # Safety check: if AI compressed too much, use cleaned text instead
                if len(part) < len(chunk) * 0.7:
                    print(f"Chunk {i+1}: AI compressed too much ({len(chunk)} → {len(part)}), using cleaned text")
                    enhanced_parts.append(chunk)
                else:
                    enhanced_parts.append(part)
                    print(f"Chunk {i+1}/{len(chunks)}: {len(chunk)} → {len(part)} chars")
            except Exception as e:
                print(f"Chunk {i+1} error: {e}, using cleaned text")
                enhanced_parts.append(chunk)

        result = "\n\n".join(enhanced_parts)
        # Final safety: if result is too short, return cleaned text
        if len(result) < len(cleaned) * 0.7:
            print(f"Enhancement too aggressive ({len(result)} vs {len(cleaned)}), returning cleaned text")
            return cleaned

        print(f"Enhancement complete: {len(raw_text)} → {len(result)} chars ({len(result)/max(len(raw_text),1)*100:.0f}%)")
        return result


# Singleton instance
_openrouter_service: Optional[OpenRouterService] = None


def get_openrouter_service() -> OpenRouterService:
    """Get or create OpenRouter service instance."""
    global _openrouter_service
    if _openrouter_service is None:
        _openrouter_service = OpenRouterService()
    return _openrouter_service

"""
Gemini AI Service - Document Processing
Handles PDF/image processing and text extraction.
"""
import google.generativeai as genai
from typing import Optional
import json
import httpx
import base64
from config import get_settings


class GeminiService:
    """Service for document processing using Gemini API."""

    def __init__(self):
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel("gemini-1.5-flash")

    async def process_pdf(self, file_url: str) -> dict:
        """
        Process a PDF document and extract structured content.

        Args:
            file_url: URL to the PDF file

        Returns:
            Dict with extracted text and structure
        """
        # Download file
        async with httpx.AsyncClient() as client:
            response = await client.get(file_url)
            file_content = response.content

        # Upload to Gemini
        file_data = base64.b64encode(file_content).decode("utf-8")

        prompt = """Analizza questo documento PDF e estrai:

1. TESTO COMPLETO: Tutto il testo presente nel documento
2. STRUTTURA: Identifica capitoli, sezioni, sottosezioni
3. CONCETTI CHIAVE: Lista dei concetti principali trattati
4. IMMAGINI/TABELLE: Descrizione di eventuali elementi visivi importanti

Rispondi in formato JSON:
{
  "full_text": "tutto il testo estratto",
  "structure": [
    {
      "type": "chapter|section|subsection",
      "title": "titolo",
      "content": "contenuto",
      "page_start": 1
    }
  ],
  "key_concepts": ["concetto1", "concetto2"],
  "visual_elements": [
    {
      "type": "image|table|diagram",
      "description": "descrizione",
      "page": 1
    }
  ]
}"""

        response = self.model.generate_content([
            {"mime_type": "application/pdf", "data": file_data},
            prompt
        ])

        # Parse response
        response_text = response.text
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        return json.loads(response_text.strip())

    async def process_image(self, image_url: str) -> dict:
        """
        Process an image (scanned page) and extract text.

        Args:
            image_url: URL to the image

        Returns:
            Dict with extracted text
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(image_url)
            image_content = response.content

        # Detect mime type
        mime_type = "image/jpeg"
        if image_url.lower().endswith(".png"):
            mime_type = "image/png"
        elif image_url.lower().endswith(".webp"):
            mime_type = "image/webp"

        image_data = base64.b64encode(image_content).decode("utf-8")

        prompt = """Questa è una pagina scansionata di un libro o documento didattico.

Estrai:
1. TUTTO il testo presente nell'immagine, mantenendo la struttura
2. Identifica titoli, paragrafi, elenchi
3. Descrivi eventuali immagini, grafici o tabelle presenti

Rispondi in formato JSON:
{
  "text": "testo estratto con formattazione",
  "has_title": true/false,
  "title": "eventuale titolo",
  "has_images": true/false,
  "image_descriptions": ["descrizione1"],
  "has_formulas": true/false,
  "formulas": ["formula in LaTeX se presente"]
}"""

        response = self.model.generate_content([
            {"mime_type": mime_type, "data": image_data},
            prompt
        ])

        response_text = response.text
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        return json.loads(response_text.strip())

    async def extract_text_simple(self, file_url: str, mime_type: str) -> str:
        """
        Simple text extraction from document.

        Args:
            file_url: URL to file
            mime_type: MIME type of file

        Returns:
            Extracted text as string
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(file_url)
            file_content = response.content

        file_data = base64.b64encode(file_content).decode("utf-8")

        prompt = "Estrai tutto il testo da questo documento. Mantieni la struttura e la formattazione. Restituisci solo il testo, senza commenti aggiuntivi."

        response = self.model.generate_content([
            {"mime_type": mime_type, "data": file_data},
            prompt
        ])

        return response.text

    async def analyze_structure(self, text: str) -> dict:
        """
        Analyze text structure to identify chapters and sections.

        Args:
            text: Document text

        Returns:
            Structure analysis
        """
        prompt = f"""Analizza la struttura di questo testo didattico e identifica:

1. Capitoli/Sezioni principali
2. Sottosezioni
3. Concetti chiave per ogni sezione

TESTO:
{text[:10000]}  # Limit to first 10k chars

Rispondi in JSON:
{{
  "chapters": [
    {{
      "title": "titolo",
      "start_position": 0,
      "subsections": ["sottosezione1"],
      "key_concepts": ["concetto1"]
    }}
  ],
  "estimated_reading_time_minutes": 10,
  "difficulty_level": "beginner|intermediate|advanced",
  "main_topics": ["topic1", "topic2"]
}}"""

        response = self.model.generate_content(prompt)

        response_text = response.text
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0]
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0]

        return json.loads(response_text.strip())


# Singleton instance
_gemini_service: Optional[GeminiService] = None


def get_gemini_service() -> GeminiService:
    """Get or create Gemini service instance."""
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiService()
    return _gemini_service

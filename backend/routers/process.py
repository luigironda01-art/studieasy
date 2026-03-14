"""
PDF Processing Router
Handles PDF text extraction and AI analysis
Supports both text-based PDFs and image-based PDFs (slides, scanned documents)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import os
import base64
from io import BytesIO
from PyPDF2 import PdfReader
from dotenv import load_dotenv
from services.openrouter_service import get_openrouter_service

# Optional: pdf2image for vision processing (requires poppler)
try:
    from pdf2image import convert_from_bytes
    PDF2IMAGE_AVAILABLE = True
except ImportError:
    PDF2IMAGE_AVAILABLE = False
    print("WARNING: pdf2image not available. Vision processing disabled.")

load_dotenv()

router = APIRouter()

# Supabase client
from supabase import create_client

supabase_url = os.getenv("SUPABASE_URL", "")
supabase_service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
supabase_anon_key = os.getenv("SUPABASE_ANON_KEY", "")

# MUST use service role key to bypass RLS
if supabase_service_key:
    print(f"Using SERVICE ROLE key for Supabase")
    supabase_key = supabase_service_key
else:
    print(f"WARNING: No SERVICE_ROLE_KEY found, using ANON key - RLS will block updates!")
    supabase_key = supabase_anon_key

supabase = create_client(supabase_url, supabase_key)


# Admin users with no processing limits
ADMIN_USER_IDS = {
    "a0c920fe-6b40-47b7-8524-86f06c294afa",  # Luigi Rondanini
}

def determine_preferred_model(text: str, extraction_method: str) -> str:
    """Analyze content to determine the best AI model for generation tasks.

    Returns a model identifier that generation endpoints can use.
    """
    import re
    text_lower = text.lower()

    # Count indicators for different content types
    scientific_indicators = 0

    # Chemical formulas: H2O, NaCl, CO2, etc.
    chemical_formulas = len(re.findall(r'\b[A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)+\b', text))
    if chemical_formulas > 5:
        scientific_indicators += 3

    # Math symbols and patterns
    math_patterns = len(re.findall(r'[±×÷∑∫∂√∞≈≠≤≥∈∉⊂⊃∪∩]', text))
    math_patterns += len(re.findall(r'\b(?:mol|mmol|mg/dl|µg|nm|kDa|pH)\b', text, re.IGNORECASE))
    if math_patterns > 10:
        scientific_indicators += 2

    # Scientific keywords
    sci_keywords = ['molecol', 'enzim', 'protein', 'cellul', 'dna', 'rna', 'formula',
                    'reazion', 'equazion', 'derivat', 'integral', 'matrice',
                    'stechiometr', 'termodinamic', 'cinetic', 'cataliz',
                    'isotop', 'elettron', 'nucleotid', 'aminoacid']
    for kw in sci_keywords:
        if kw in text_lower:
            scientific_indicators += 1

    # Image-heavy content (vision was needed)
    if extraction_method in ("hybrid", "vision"):
        scientific_indicators += 1

    # Decision
    if scientific_indicators >= 5:
        # Gemini Pro is better for scientific/formula-heavy content
        return "google/gemini-2.0-flash-001"
    else:
        # Claude is better for discursive/humanistic content
        return "anthropic/claude-sonnet-4"


class ProcessRequest(BaseModel):
    source_id: str
    chapter_id: str
    pdf_url: str


class ProcessResponse(BaseModel):
    success: bool
    message: str


@router.post("/", response_model=ProcessResponse)
async def process_pdf(request: ProcessRequest):
    """Process a PDF: extract text and analyze with AI"""

    # Check if user is admin (no limits)
    source_data = supabase.table("sources").select("user_id").eq("id", request.source_id).single().execute()
    is_admin = source_data.data and source_data.data.get("user_id") in ADMIN_USER_IDS
    max_vision_pages = 100 if is_admin else 20  # No practical limit for admins

    # Quality tracking variables
    extraction_quality = 0
    extraction_method = "text"
    extraction_notes = []
    page_count = 0
    chars_extracted = 0

    def update_progress(progress: int, message: str = ""):
        """Update processing progress in database"""
        try:
            supabase.table("chapters").update({
                "processing_progress": progress
            }).eq("id", request.chapter_id).execute()
            if message:
                print(f"[{progress}%] {message}")
        except Exception as e:
            print(f"Failed to update progress: {e}")

    try:
        # Update status to processing
        supabase.table("chapters").update({
            "processing_status": "processing",
            "processing_progress": 5
        }).eq("id", request.chapter_id).execute()

        update_progress(10, "Scaricamento PDF...")

        # Fetch PDF from URL
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(request.pdf_url)
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to fetch PDF")
            pdf_bytes = response.content

        update_progress(20, "PDF scaricato, iniziando estrazione...")

        # Initialize OpenRouter service
        openrouter = get_openrouter_service()

        # Extract text from PDF using PyPDF2 (primary method)
        extracted_text = ""
        use_vision = False

        try:
            pdf_reader = PdfReader(BytesIO(pdf_bytes))
            page_count = len(pdf_reader.pages)
            print(f"PDF has {page_count} pages")

            update_progress(25, f"Rilevate {page_count} pagine, estrazione testo...")

            for i, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text()
                if page_text:
                    extracted_text += page_text + "\n\n"
                # Update progress per page (25-50%)
                page_progress = 25 + int((i + 1) / page_count * 25)
                if i % 5 == 0 or i == page_count - 1:
                    update_progress(page_progress, f"Pagina {i+1}/{page_count}")

            chars_extracted = len(extracted_text)

            # Check if text extraction was successful
            avg_chars_per_page = chars_extracted / max(page_count, 1)

            # For admin users: always use vision to capture images/diagrams (hybrid mode)
            if is_admin:
                print(f"Admin user: forcing hybrid mode (text + vision)")
                use_vision = True
                extraction_notes.append("Modalità ibrida (testo + vision) per massima qualità")
            elif avg_chars_per_page < 100:
                # Low text density - likely image-based PDF
                print(f"Low text density ({avg_chars_per_page:.0f} chars/page) - trying vision")
                use_vision = True
                extraction_notes.append(f"Bassa densità testo ({avg_chars_per_page:.0f} char/pagina)")
            else:
                extraction_quality = 100

        except Exception as pdf_error:
            print(f"PDF extraction error: {pdf_error}")
            use_vision = True
            extraction_notes.append(f"Errore estrazione testo: {str(pdf_error)[:100]}")

        update_progress(50, "Estrazione testo completata")

        # Fallback to vision processing for image-based PDFs
        if use_vision and PDF2IMAGE_AVAILABLE and page_count <= max_vision_pages:
            try:
                print(f"Using Vision AI for image-based PDF ({page_count} pages, limit={max_vision_pages})...")
                extraction_method = "vision"
                update_progress(55, "Avviando Vision AI...")

                # Convert PDF to images
                images = convert_from_bytes(pdf_bytes, dpi=150, fmt='png')
                print(f"Converted {len(images)} pages to images")
                update_progress(60, f"Convertite {len(images)} pagine in immagini")

                # Convert images to base64
                images_base64 = []
                for img in images[:max_vision_pages]:
                    buffer = BytesIO()
                    img.save(buffer, format='PNG')
                    img_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                    images_base64.append(img_b64)

                # Process in batches of 20 pages for API limits
                vision_text = ""
                batch_size = 20
                total_batches = (len(images_base64) + batch_size - 1) // batch_size

                for batch_idx in range(total_batches):
                    start = batch_idx * batch_size
                    end = min(start + batch_size, len(images_base64))
                    batch = images_base64[start:end]

                    batch_progress = 65 + int((batch_idx / total_batches) * 5)
                    update_progress(batch_progress, f"Vision AI: batch {batch_idx+1}/{total_batches} (pagine {start+1}-{end})...")

                    try:
                        batch_text = await openrouter.process_document_with_vision(batch)
                        vision_text += batch_text + "\n\n"
                        print(f"Batch {batch_idx+1}/{total_batches}: extracted {len(batch_text)} chars")
                    except Exception as batch_error:
                        print(f"Batch {batch_idx+1}/{total_batches} failed: {batch_error}")
                        extraction_notes.append(f"Batch {batch_idx+1} fallito (pagine {start+1}-{end})")
                        # Continue with other batches instead of failing entirely

                vision_chars = len(vision_text)
                print(f"Vision total: {vision_chars} chars")
                update_progress(70, f"Vision AI: estratti {vision_chars} caratteri")

                # Choose best extraction (don't combine - causes duplication)
                if vision_chars > 0:
                    extracted_text = vision_text
                    chars_extracted = vision_chars
                    extraction_method = "vision"
                    extraction_quality = min(100, int((vision_chars / (page_count * 500)) * 100))
                    extraction_notes.append(f"Vision AI: {vision_chars} chars da {page_count} pagine")
                else:
                    # Vision failed but we have PyPDF2 text
                    extraction_method = "text"
                    extraction_quality = min(100, int((chars_extracted / (page_count * 500)) * 100))
                    extraction_notes.append("Vision AI senza risultati, usato solo testo")

            except Exception as vision_error:
                print(f"Vision processing error: {vision_error}")
                extraction_notes.append(f"Errore Vision AI: {str(vision_error)[:100]}")
                if not extracted_text:
                    extracted_text = "[Errore nell'estrazione del testo dal PDF]"
                    extraction_quality = 0
                    extraction_method = "failed"
                else:
                    # Partial success with text
                    extraction_quality = min(50, int((chars_extracted / (page_count * 500)) * 100))

        elif use_vision and not PDF2IMAGE_AVAILABLE:
            print("Vision processing not available (pdf2image not installed)")
            extraction_notes.append("Vision AI non disponibile (pdf2image non installato)")
            if not extracted_text:
                extracted_text = "[PDF basato su immagini - Vision AI non disponibile]"
                extraction_quality = 0
                extraction_method = "failed"
            else:
                extraction_quality = min(30, int((chars_extracted / (page_count * 500)) * 100))

        elif use_vision and page_count > max_vision_pages:
            extraction_notes.append(f"PDF troppo lungo per Vision AI ({page_count} pagine, max {max_vision_pages})")
            extraction_quality = min(30, int((chars_extracted / (page_count * 500)) * 100))

        # Ensure minimum quality if we have meaningful text
        if chars_extracted > 1000 and extraction_quality < 50:
            extraction_quality = 50

        # Cap quality at 100
        extraction_quality = min(100, max(0, extraction_quality))

        # Prepare common metadata
        notes_string = " | ".join(extraction_notes) if extraction_notes else None
        preferred_model = determine_preferred_model(extracted_text, extraction_method)
        print(f"Smart model selection: {preferred_model}")

        # Step 1: Enhance the FULL text first (high quality on complete context)
        update_progress(72, "Analisi AI del contenuto...")
        processed_text = await openrouter.enhance_processed_text(extracted_text)
        print(f"Full text enhanced: {len(extracted_text)} -> {len(processed_text)} chars")

        # Step 2: Smart Chapter Splitting on the ENHANCED text
        update_progress(82, "Identificazione capitoli...")
        chapter_splits = await openrouter.split_into_chapters(processed_text)

        if len(chapter_splits) >= 2:
            # --- MULTI-CHAPTER MODE ---
            print(f"Splitting into {len(chapter_splits)} chapters")
            update_progress(85, f"Trovati {len(chapter_splits)} capitoli, suddivisione...")

            # Split the enhanced text based on markers
            chapter_texts = []
            for idx, split in enumerate(chapter_splits):
                marker = split["start_marker"]
                # Find the marker position in enhanced text
                pos = processed_text.find(marker)
                if pos == -1:
                    # Try partial match (first 50 chars of marker)
                    short_marker = marker[:50]
                    pos = processed_text.find(short_marker)
                if pos == -1 and idx == 0:
                    pos = 0  # First chapter always starts at beginning
                chapter_texts.append({"title": split["title"], "pos": pos if pos >= 0 else -1})

            # Filter out chapters where marker wasn't found (except first)
            chapter_texts = [c for c in chapter_texts if c["pos"] >= 0]

            # Sort by position and calculate text ranges
            chapter_texts.sort(key=lambda c: c["pos"])

            # Build final chapter data with text slices from enhanced text
            chapters_data = []
            for idx, ch in enumerate(chapter_texts):
                start = ch["pos"]
                end = chapter_texts[idx + 1]["pos"] if idx + 1 < len(chapter_texts) else len(processed_text)
                enhanced_slice = processed_text[start:end].strip()
                if len(enhanced_slice) > 100:  # Skip tiny chapters
                    chapters_data.append({"title": ch["title"], "processed_text": enhanced_slice})

            if len(chapters_data) < 2:
                # Fallback: splitting failed, use single chapter
                chapters_data = [{"title": "Documento completo", "processed_text": processed_text}]

            # Get file_url from original chapter
            orig_chapter = supabase.table("chapters").select("file_url").eq("id", request.chapter_id).single().execute()
            file_url = orig_chapter.data.get("file_url") if orig_chapter.data else None

            # Save chapters (text is already enhanced, no per-chapter AI calls needed)
            for idx, ch_data in enumerate(chapters_data):
                progress = 88 + int((idx / len(chapters_data)) * 10)
                update_progress(progress, f"Salvataggio capitolo {idx+1}/{len(chapters_data)}...")

                chapter_update = {
                    "title": ch_data["title"],
                    "order_index": idx,
                    "raw_text": ch_data["processed_text"],  # Store enhanced text as raw too
                    "processed_text": ch_data["processed_text"],
                    "processing_status": "completed",
                    "processing_progress": 100,
                    "extraction_quality": extraction_quality,
                    "extraction_method": extraction_method,
                    "extraction_notes": notes_string,
                    "chars_extracted": len(ch_data["processed_text"]),
                    "page_count": page_count if idx == 0 else None,
                    "preferred_model": preferred_model,
                }

                if idx == 0:
                    chapter_update["file_url"] = file_url
                    supabase.table("chapters").update(chapter_update).eq("id", request.chapter_id).execute()
                    print(f"Chapter 1 updated: {ch_data['title']}")
                else:
                    chapter_update["source_id"] = request.source_id
                    chapter_update["file_url"] = file_url
                    supabase.table("chapters").insert(chapter_update).execute()
                    print(f"Chapter {idx+1} created: {ch_data['title']}")

            update_progress(100, "Elaborazione completata!")
            print(f"[100%] Elaborazione completata! {len(chapters_data)} capitoli creati")

            return ProcessResponse(
                success=True,
                message=f"Documento elaborato in {len(chapters_data)} capitoli ({extraction_quality}% qualità)"
            )

        else:
            # --- SINGLE CHAPTER MODE (fallback) ---
            update_progress(90, "Salvataggio risultati...")
            print(f"Updating chapter {request.chapter_id} with processed text...")
            update_data = {
                "raw_text": extracted_text,
                "processed_text": processed_text,
                "processing_status": "completed",
                "processing_progress": 100,
                "extraction_quality": extraction_quality,
                "extraction_method": extraction_method,
                "extraction_notes": notes_string,
                "chars_extracted": chars_extracted,
                "page_count": page_count,
                "preferred_model": preferred_model,
            }
            supabase.table("chapters").update(update_data).eq("id", request.chapter_id).execute()
            print(f"Extraction quality: {extraction_quality}%, method: {extraction_method}")
            print(f"[100%] Elaborazione completata!")

            return ProcessResponse(
                success=True,
                message=f"Documento elaborato ({extraction_quality}% qualità)"
            )

    except Exception as e:
        print(f"Processing error: {e}")
        # Update status to error with quality info
        try:
            supabase.table("chapters").update({
                "processing_status": "error",
                "processing_progress": 0,
                "extraction_quality": 0,
                "extraction_method": "failed",
                "extraction_notes": f"Errore critico: {str(e)[:200]}",
                "chars_extracted": chars_extracted,
                "page_count": page_count,
            }).eq("id", request.chapter_id).execute()
        except:
            pass

        raise HTTPException(status_code=500, detail=str(e))

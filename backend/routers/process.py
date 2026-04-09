"""
PDF Processing Router
Handles PDF text extraction and AI analysis
Supports both text-based PDFs and image-based PDFs (slides, scanned documents)
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import asyncio
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


# Admin users with no processing limits — load from env var
# Set ADMIN_USER_IDS env var as comma-separated UUIDs
ADMIN_USER_IDS = set(
    uid.strip() for uid in os.getenv("ADMIN_USER_IDS", "").split(",") if uid.strip()
)

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
    max_vision_pages = 1000  # No limits for now (small user base)

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

        # ═══ SMART PAGE ANALYSIS & EXTRACTION ═══
        # Analyze each page to determine: TEXT_ONLY, IMAGE_ONLY, or MIXED
        # Then extract using the best method for each page type

        extracted_text = ""
        page_count = 0

        try:
            pdf_reader = PdfReader(BytesIO(pdf_bytes))
            page_count = len(pdf_reader.pages)
            print(f"PDF has {page_count} pages")
            update_progress(20, f"Rilevate {page_count} pagine, analisi contenuto...")

            # Step 1: Classify each page
            page_analysis = []
            text_only_pages = []
            vision_needed_pages = []

            for i, page in enumerate(pdf_reader.pages):
                page_text = page.extract_text() or ""
                text_chars = len(page_text.strip())

                # Detect embedded images
                try:
                    has_images = len(page.images) > 0
                except Exception:
                    has_images = False

                # Classify page
                if text_chars > 200 and not has_images:
                    page_type = "TEXT_ONLY"
                    text_only_pages.append(i)
                elif text_chars < 50 and (has_images or text_chars == 0):
                    page_type = "IMAGE_ONLY"
                    vision_needed_pages.append(i)
                else:
                    page_type = "MIXED"
                    vision_needed_pages.append(i)

                page_analysis.append({
                    "index": i,
                    "type": page_type,
                    "text": page_text,
                    "text_chars": text_chars,
                    "has_images": has_images,
                })

            text_count = len(text_only_pages)
            vision_count = len(vision_needed_pages)
            print(f"Page analysis: {text_count} text-only, {vision_count} need vision (image/mixed)")
            extraction_notes.append(f"Analisi: {text_count} pagine testo, {vision_count} pagine con immagini")

            update_progress(30, f"Analisi completata: {text_count} testo, {vision_count} immagini")

            # Step 2: Extract text from TEXT_ONLY pages directly (PyPDF2 = highest quality)
            page_texts = {}
            for pa in page_analysis:
                if pa["type"] == "TEXT_ONLY":
                    page_texts[pa["index"]] = pa["text"]

            # Step 3: Send vision-needed pages to Vision AI
            if vision_needed_pages and PDF2IMAGE_AVAILABLE and len(vision_needed_pages) <= max_vision_pages:
                try:
                    update_progress(35, f"Vision AI per {len(vision_needed_pages)} pagine...")
                    extraction_method = "hybrid"

                    # Convert only vision-needed pages to images
                    all_images = convert_from_bytes(pdf_bytes, dpi=200, fmt='png')
                    print(f"Converted PDF to {len(all_images)} images")

                    # Build batches of vision-needed pages (max 10 per batch for quality)
                    vision_batch_size = 10
                    vision_pages_data = []
                    for page_idx in vision_needed_pages:
                        if page_idx < len(all_images):
                            buffer = BytesIO()
                            all_images[page_idx].save(buffer, format='PNG')
                            img_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                            vision_pages_data.append({"index": page_idx, "image": img_b64})

                    total_vision_batches = (len(vision_pages_data) + vision_batch_size - 1) // vision_batch_size

                    for batch_idx in range(total_vision_batches):
                        start = batch_idx * vision_batch_size
                        end = min(start + vision_batch_size, len(vision_pages_data))
                        batch = vision_pages_data[start:end]
                        batch_images = [p["image"] for p in batch]
                        batch_page_nums = [p["index"] + 1 for p in batch]

                        progress = 40 + int((batch_idx / max(total_vision_batches, 1)) * 25)
                        update_progress(progress, f"Vision AI: pagine {batch_page_nums[0]}-{batch_page_nums[-1]}...")

                        try:
                            batch_text = await openrouter.process_document_with_vision(batch_images)
                            # Store vision text for these pages as a group
                            for p in batch:
                                page_texts[p["index"]] = None  # Mark as vision-processed
                            # Split vision output by page separator and assign
                            vision_sections = batch_text.split("---")
                            for sec_idx, section in enumerate(vision_sections):
                                section = section.strip()
                                if section and sec_idx < len(batch):
                                    actual_page = batch[sec_idx]["index"]
                                    # For MIXED pages: combine PyPDF2 text + Vision AI images
                                    pa = page_analysis[actual_page]
                                    if pa["type"] == "MIXED" and pa["text_chars"] > 200:
                                        # Keep PyPDF2 text, add only [IMMAGINE:] tags from vision
                                        import re
                                        image_tags = re.findall(r'\[IMMAGINE:.*?\]', section, re.DOTALL)
                                        formula_tags = re.findall(r'\[FORMULA:.*?\]', section, re.DOTALL)
                                        combined = pa["text"] + "\n\n"
                                        if image_tags:
                                            combined += "\n".join(image_tags) + "\n\n"
                                        if formula_tags:
                                            combined += "\n".join(formula_tags) + "\n\n"
                                        page_texts[actual_page] = combined
                                    else:
                                        page_texts[actual_page] = section
                            # Fallback: if split didn't work, assign entire batch output to first page
                            if len(vision_sections) < len(batch):
                                for p in batch:
                                    if page_texts.get(p["index"]) is None:
                                        page_texts[p["index"]] = batch_text if p == batch[0] else ""

                            print(f"Vision batch {batch_idx+1}/{total_vision_batches}: {len(batch_text)} chars for pages {batch_page_nums}")
                        except Exception as batch_error:
                            print(f"Vision batch {batch_idx+1} failed: {batch_error}")
                            extraction_notes.append(f"Vision fallito per pagine {batch_page_nums}")
                            # Fallback to PyPDF2 text for these pages
                            for p in batch:
                                pa = page_analysis[p["index"]]
                                page_texts[p["index"]] = pa["text"] if pa["text_chars"] > 0 else ""

                except Exception as vision_error:
                    print(f"Vision processing error: {vision_error}")
                    extraction_notes.append(f"Errore Vision AI: {str(vision_error)[:100]}")
                    # Fallback: use PyPDF2 text for all pages
                    for pa in page_analysis:
                        if pa["index"] not in page_texts:
                            page_texts[pa["index"]] = pa["text"]

            elif vision_needed_pages and not PDF2IMAGE_AVAILABLE:
                extraction_notes.append("Vision AI non disponibile (pdf2image non installato)")
                # Use PyPDF2 text as fallback
                for pa in page_analysis:
                    if pa["index"] not in page_texts:
                        page_texts[pa["index"]] = pa["text"]

            elif vision_needed_pages and len(vision_needed_pages) > max_vision_pages:
                extraction_notes.append(f"Troppe pagine per Vision ({len(vision_needed_pages)}, max {max_vision_pages})")
                for pa in page_analysis:
                    if pa["index"] not in page_texts:
                        page_texts[pa["index"]] = pa["text"]
            else:
                # All pages are text-only
                extraction_method = "text"

            # Step 4: Assemble final text in page order
            assembled_parts = []
            for i in range(page_count):
                text = page_texts.get(i, "")
                if text and text.strip():
                    assembled_parts.append(text.strip())
            extracted_text = "\n\n".join(assembled_parts)
            chars_extracted = len(extracted_text)

            # Set extraction method
            if vision_needed_pages and PDF2IMAGE_AVAILABLE:
                if text_only_pages:
                    extraction_method = "hybrid"
                    extraction_notes.append(f"Ibrido: PyPDF2 ({text_count} pag) + Vision AI ({vision_count} pag)")
                else:
                    extraction_method = "vision"
            else:
                extraction_method = "text"

            # Calculate quality
            extraction_quality = min(100, int((chars_extracted / max(page_count * 300, 1)) * 100))

        except Exception as pdf_error:
            print(f"PDF extraction error: {pdf_error}")
            extraction_notes.append(f"Errore estrazione: {str(pdf_error)[:100]}")
            if not extracted_text:
                extracted_text = "[Errore nell'estrazione del testo dal PDF]"
                extraction_quality = 0
                extraction_method = "failed"

        update_progress(65, "Estrazione completata")

        # Ensure minimum quality if we have meaningful text
        if chars_extracted > 1000 and extraction_quality < 50:
            extraction_quality = 50
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

            # Clean up old chapters from previous processing (except the original one)
            try:
                supabase.table("chapters").delete().eq("source_id", request.source_id).neq("id", request.chapter_id).execute()
                print(f"Cleaned up old chapters for source {request.source_id}")
            except Exception as cleanup_err:
                print(f"Warning: cleanup of old chapters failed: {cleanup_err}")

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

            # --- AUTO GENERATE SUMMARIES FOR ALL CHAPTERS ---
            update_progress(92, "Generazione riassunti capitoli...")
            print(f"Auto-generating summaries for {len(chapters_data)} chapters...")

            # Fetch all chapter IDs for this source (including newly created ones)
            all_chapters = supabase.table("chapters").select("id, title, processed_text, preferred_model").eq("source_id", request.source_id).order("order_index").execute()

            if all_chapters.data:
                openrouter = get_openrouter_service()
                valid_chapters = [ch for ch in all_chapters.data if ch.get("processed_text")]
                update_progress(93, f"Generando {len(valid_chapters)} riassunti in parallelo...")

                async def gen_summary_safe(ch):
                    try:
                        return ch, await openrouter.generate_chapter_summary(
                            ch["processed_text"],
                            ch.get("preferred_model", "anthropic/claude-sonnet-4")
                        )
                    except Exception as err:
                        print(f"  Warning: summary generation failed for '{ch['title']}': {err}")
                        return ch, None

                # Run all summary generations concurrently
                results = await asyncio.gather(*[gen_summary_safe(ch) for ch in valid_chapters])

                update_progress(98, "Salvataggio riassunti...")
                for ch, summary_text in results:
                    if not summary_text:
                        continue
                    try:
                        existing = supabase.table("summaries").select("id").eq("chapter_id", ch["id"]).execute()
                        if existing.data:
                            supabase.table("summaries").delete().eq("id", existing.data[0]["id"]).execute()

                        word_count = len(summary_text.strip().split())
                        supabase.table("summaries").insert({
                            "chapter_id": ch["id"],
                            "user_id": source_data.data["user_id"],
                            "content": summary_text,
                            "word_count": word_count,
                            "target_words": 500,
                        }).execute()
                        print(f"  Summary for '{ch['title']}': {word_count} words")
                    except Exception as save_err:
                        print(f"  Warning: failed to save summary for '{ch['title']}': {save_err}")

            update_progress(100, "Elaborazione completata!")
            print(f"[100%] Elaborazione completata! {len(chapters_data)} capitoli + riassunti")

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

            # --- AUTO GENERATE SUMMARY FOR SINGLE CHAPTER ---
            update_progress(93, "Generazione riassunto...")
            try:
                openrouter = get_openrouter_service()
                summary_text = await openrouter.generate_chapter_summary(
                    processed_text,
                    preferred_model or "anthropic/claude-sonnet-4"
                )
                if summary_text:
                    existing = supabase.table("summaries").select("id").eq("chapter_id", request.chapter_id).execute()
                    if existing.data:
                        supabase.table("summaries").delete().eq("id", existing.data[0]["id"]).execute()
                    word_count = len(summary_text.strip().split())
                    supabase.table("summaries").insert({
                        "chapter_id": request.chapter_id,
                        "user_id": source_data.data["user_id"],
                        "content": summary_text,
                        "word_count": word_count,
                        "target_words": 500,
                    }).execute()
                    print(f"  Summary generated: {word_count} words")
            except Exception as sum_err:
                print(f"  Warning: summary generation failed: {sum_err}")

            update_progress(100, "Elaborazione completata!")
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

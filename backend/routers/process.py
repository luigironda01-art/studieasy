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
            # If less than 100 chars per page on average, likely image-based PDF
            avg_chars_per_page = chars_extracted / max(page_count, 1)
            if avg_chars_per_page < 100:
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
        if use_vision and PDF2IMAGE_AVAILABLE and page_count <= 20:
            try:
                print("Using Vision AI for image-based PDF...")
                extraction_method = "vision"
                update_progress(55, "Avviando Vision AI...")

                # Convert PDF to images
                images = convert_from_bytes(pdf_bytes, dpi=150, fmt='png')
                print(f"Converted {len(images)} pages to images")
                update_progress(60, f"Convertite {len(images)} pagine in immagini")

                # Convert images to base64
                images_base64 = []
                for img in images[:20]:  # Limit to 20 pages
                    buffer = BytesIO()
                    img.save(buffer, format='PNG')
                    img_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                    images_base64.append(img_b64)

                update_progress(65, "Elaborazione con Vision AI...")
                # Process with vision AI
                vision_text = await openrouter.process_document_with_vision(images_base64)
                vision_chars = len(vision_text)
                print(f"Vision extracted {vision_chars} chars")
                update_progress(70, f"Vision AI: estratti {vision_chars} caratteri")

                # Use vision text if better than text extraction
                if vision_chars > chars_extracted:
                    extracted_text = vision_text
                    chars_extracted = vision_chars
                    extraction_method = "vision"
                    extraction_quality = min(100, int((vision_chars / (page_count * 500)) * 100))
                    extraction_notes.append(f"Usato Vision AI per PDF basato su immagini")
                else:
                    extraction_method = "hybrid"
                    extraction_quality = min(100, int((chars_extracted / (page_count * 500)) * 100))

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

        elif use_vision and page_count > 20:
            extraction_notes.append(f"PDF troppo lungo per Vision AI ({page_count} pagine, max 20)")
            extraction_quality = min(30, int((chars_extracted / (page_count * 500)) * 100))

        # Ensure minimum quality if we have meaningful text
        if chars_extracted > 1000 and extraction_quality < 50:
            extraction_quality = 50

        # Cap quality at 100
        extraction_quality = min(100, max(0, extraction_quality))

        update_progress(75, "Analisi AI del contenuto...")

        # Use Claude via OpenRouter to create structured analysis
        processed_text = await openrouter.enhance_processed_text(extracted_text)

        update_progress(90, "Salvataggio risultati...")

        # Prepare notes string
        notes_string = " | ".join(extraction_notes) if extraction_notes else None

        # Save to database with quality metrics
        print(f"Updating chapter {request.chapter_id} with processed text...")
        update_data = {
            "raw_text": extracted_text,
            "processed_text": processed_text,
            "processing_status": "completed",
            "processing_progress": 100,
            "extraction_quality": extraction_quality,
            "extraction_method": extraction_method,
            "extraction_notes": notes_string,
            "page_count": page_count,
            "chars_extracted": chars_extracted
        }
        update_result = supabase.table("chapters").update(update_data).eq("id", request.chapter_id).execute()
        print(f"Update result: {update_result}")
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
                "page_count": page_count,
                "chars_extracted": chars_extracted
            }).eq("id", request.chapter_id).execute()
        except:
            pass

        raise HTTPException(status_code=500, detail=str(e))

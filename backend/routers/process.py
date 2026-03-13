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
    try:
        # Update status to processing
        supabase.table("chapters").update({
            "processing_status": "processing"
        }).eq("id", request.chapter_id).execute()

        # Fetch PDF from URL
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(request.pdf_url)
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to fetch PDF")
            pdf_bytes = response.content

        # Initialize OpenRouter service
        openrouter = get_openrouter_service()

        # Extract text from PDF using PyPDF2 (primary method)
        extracted_text = ""
        page_count = 0
        use_vision = False

        try:
            pdf_reader = PdfReader(BytesIO(pdf_bytes))
            page_count = len(pdf_reader.pages)
            print(f"PDF has {page_count} pages")

            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    extracted_text += page_text + "\n\n"

            # Check if text extraction was successful
            # If less than 100 chars per page on average, likely image-based PDF
            avg_chars_per_page = len(extracted_text) / max(page_count, 1)
            if avg_chars_per_page < 100:
                print(f"Low text density ({avg_chars_per_page:.0f} chars/page) - trying vision")
                use_vision = True

        except Exception as pdf_error:
            print(f"PDF extraction error: {pdf_error}")
            use_vision = True

        # Fallback to vision processing for image-based PDFs
        if use_vision and PDF2IMAGE_AVAILABLE and page_count <= 20:
            try:
                print("Using Vision AI for image-based PDF...")
                # Convert PDF to images
                images = convert_from_bytes(pdf_bytes, dpi=150, fmt='png')
                print(f"Converted {len(images)} pages to images")

                # Convert images to base64
                images_base64 = []
                for img in images[:20]:  # Limit to 20 pages
                    buffer = BytesIO()
                    img.save(buffer, format='PNG')
                    img_b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
                    images_base64.append(img_b64)

                # Process with vision AI
                extracted_text = await openrouter.process_document_with_vision(images_base64)
                print(f"Vision extracted {len(extracted_text)} chars")

            except Exception as vision_error:
                print(f"Vision processing error: {vision_error}")
                if not extracted_text:
                    extracted_text = "[Errore nell'estrazione del testo dal PDF]"
        elif use_vision and not PDF2IMAGE_AVAILABLE:
            print("Vision processing not available (pdf2image not installed)")
            if not extracted_text:
                extracted_text = "[PDF basato su immagini - installare pdf2image per il supporto]"

        # Use Claude via OpenRouter to create structured analysis
        processed_text = await openrouter.enhance_processed_text(extracted_text)

        # Save to database
        print(f"Updating chapter {request.chapter_id} with processed text...")
        update_data = {
            "raw_text": extracted_text,
            "processed_text": processed_text,
            "processing_status": "completed"
        }
        update_result = supabase.table("chapters").update(update_data).eq("id", request.chapter_id).execute()
        print(f"Update result: {update_result}")

        return ProcessResponse(
            success=True,
            message="Documento elaborato con successo"
        )

    except Exception as e:
        print(f"Processing error: {e}")
        # Update status to error
        try:
            supabase.table("chapters").update({
                "processing_status": "error"
            }).eq("id", request.chapter_id).execute()
        except:
            pass

        raise HTTPException(status_code=500, detail=str(e))

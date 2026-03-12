"""
PDF Processing Router
Handles PDF text extraction and AI analysis
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import httpx
import os
from io import BytesIO
from PyPDF2 import PdfReader
from dotenv import load_dotenv
from services.openrouter_service import get_openrouter_service

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

        # Extract text from PDF using PyPDF2
        extracted_text = ""
        page_count = 0
        try:
            pdf_reader = PdfReader(BytesIO(pdf_bytes))
            page_count = len(pdf_reader.pages)
            print(f"PDF has {page_count} pages")
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    extracted_text += page_text + "\n\n"
        except Exception as pdf_error:
            print(f"PDF extraction error: {pdf_error}")
            extracted_text = "[Errore nell'estrazione del testo dal PDF]"

        # Use Claude via OpenRouter to create structured analysis
        openrouter = get_openrouter_service()
        processed_text = await openrouter.enhance_processed_text(extracted_text)

        # Determine topic emoji based on content
        topic_emoji = await openrouter.determine_topic_emoji(processed_text)
        print(f"Determined topic emoji: {topic_emoji}")

        # Save to database
        print(f"Updating chapter {request.chapter_id} with processed text...")
        update_data = {
            "raw_text": extracted_text,
            "processed_text": processed_text,
            "processing_status": "completed"
        }
        # Add page count if available
        if page_count > 0:
            update_data["page_count"] = page_count
        update_result = supabase.table("chapters").update(update_data).eq("id", request.chapter_id).execute()
        print(f"Update result: {update_result}")

        # Update source with topic emoji (only if not already set)
        source_result = supabase.table("sources").select("topic_emoji").eq("id", request.source_id).single().execute()
        if source_result.data and not source_result.data.get("topic_emoji"):
            supabase.table("sources").update({
                "topic_emoji": topic_emoji
            }).eq("id", request.source_id).execute()
            print(f"Updated source {request.source_id} with emoji {topic_emoji}")

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

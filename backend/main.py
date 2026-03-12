"""
Studio Backend - FastAPI Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(
    title="Studio API",
    description="AI-powered study app backend",
    version="0.1.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",  # Next.js dev
        "https://*.vercel.app",   # Vercel preview
        os.getenv("FRONTEND_URL", "http://localhost:3000")
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"message": "Studio API", "status": "running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "0.1.0"}


# Import routers
from routers import flashcards, study, process

app.include_router(flashcards.router, prefix="/api/flashcards", tags=["flashcards"])
app.include_router(study.router, prefix="/api/study", tags=["study"])
app.include_router(process.router, prefix="/api/process", tags=["process"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

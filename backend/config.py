"""
Studio Backend - Configuration
"""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    app_name: str = "Studio API"
    debug: bool = False

    # Supabase
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""

    # AI APIs
    openrouter_api_key: str = ""  # Primary - unified access
    anthropic_api_key: str = ""   # Legacy
    gemini_api_key: str = ""      # Legacy

    # Security
    secret_key: str = "development-secret-key-change-in-production"

    # CORS
    frontend_url: str = "http://localhost:3000"

    # Database (optional)
    database_url: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore extra fields from .env


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

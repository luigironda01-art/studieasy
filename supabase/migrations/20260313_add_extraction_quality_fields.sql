-- Migration: Add extraction quality tracking fields to chapters table
-- Date: 2026-03-13
-- Purpose: Track PDF extraction quality for user feedback

-- Add extraction quality fields to chapters table
ALTER TABLE chapters
ADD COLUMN IF NOT EXISTS extraction_quality INTEGER DEFAULT NULL
    CHECK (extraction_quality >= 0 AND extraction_quality <= 100);

ALTER TABLE chapters
ADD COLUMN IF NOT EXISTS extraction_method TEXT DEFAULT NULL
    CHECK (extraction_method IN ('text', 'vision', 'hybrid', 'failed'));

ALTER TABLE chapters
ADD COLUMN IF NOT EXISTS extraction_notes TEXT DEFAULT NULL;

ALTER TABLE chapters
ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT NULL;

ALTER TABLE chapters
ADD COLUMN IF NOT EXISTS chars_extracted INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN chapters.extraction_quality IS 'Extraction quality percentage (0-100)';
COMMENT ON COLUMN chapters.extraction_method IS 'Method used: text (PyPDF2), vision (Gemini), hybrid, or failed';
COMMENT ON COLUMN chapters.extraction_notes IS 'Warnings or error messages during extraction';
COMMENT ON COLUMN chapters.page_count IS 'Number of pages in the PDF';
COMMENT ON COLUMN chapters.chars_extracted IS 'Total characters extracted from PDF';

-- Migration: Add processing progress field to chapters table
-- Date: 2026-03-13
-- Purpose: Track PDF processing progress for progress bar display

ALTER TABLE chapters
ADD COLUMN IF NOT EXISTS processing_progress INTEGER DEFAULT 0
    CHECK (processing_progress >= 0 AND processing_progress <= 100);

COMMENT ON COLUMN chapters.processing_progress IS 'Processing progress percentage (0-100)';

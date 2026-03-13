-- Migration: Add difficulty and batch_id to flashcards table
-- Also add difficulty to quizzes table
-- Run this in Supabase SQL Editor

-- ============================================
-- FLASHCARDS: Add difficulty and batch_id
-- ============================================

-- Add difficulty column (existing cards will be 'medium' by default)
ALTER TABLE flashcards
ADD COLUMN IF NOT EXISTS difficulty TEXT
CHECK (difficulty IN ('easy', 'medium', 'hard'))
DEFAULT 'medium';

-- Add batch_id for grouping flashcards generated together
ALTER TABLE flashcards
ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_flashcards_difficulty ON flashcards(difficulty);
CREATE INDEX IF NOT EXISTS idx_flashcards_batch_id ON flashcards(batch_id);

-- Composite index for common query pattern (chapter + difficulty)
CREATE INDEX IF NOT EXISTS idx_flashcards_chapter_difficulty
ON flashcards(chapter_id, difficulty);

-- ============================================
-- QUIZZES: Add difficulty
-- ============================================

ALTER TABLE quizzes
ADD COLUMN IF NOT EXISTS difficulty TEXT
CHECK (difficulty IN ('easy', 'medium', 'hard'))
DEFAULT 'medium';

CREATE INDEX IF NOT EXISTS idx_quizzes_difficulty ON quizzes(difficulty);

-- ============================================
-- VERIFY MIGRATION
-- ============================================
-- Run these queries to verify:
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'flashcards';
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'quizzes';

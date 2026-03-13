-- Migration: Add summaries table
-- Run this in Supabase SQL Editor

-- ============================================
-- SUMMARIES TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id UUID NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    word_count INTEGER NOT NULL DEFAULT 0,
    target_words INTEGER NOT NULL DEFAULT 500,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_summaries_chapter_id ON summaries(chapter_id);
CREATE INDEX IF NOT EXISTS idx_summaries_user_id ON summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_summaries_created_at ON summaries(created_at DESC);

-- Composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_summaries_user_chapter
ON summaries(user_id, chapter_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;

-- Users can only see their own summaries
CREATE POLICY "Users can view own summaries" ON summaries
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own summaries
CREATE POLICY "Users can insert own summaries" ON summaries
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own summaries
CREATE POLICY "Users can update own summaries" ON summaries
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own summaries
CREATE POLICY "Users can delete own summaries" ON summaries
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- SERVICE ROLE BYPASS (for API routes)
-- ============================================
-- The service role key bypasses RLS automatically

-- ============================================
-- VERIFY MIGRATION
-- ============================================
-- Run this query to verify:
-- SELECT * FROM information_schema.tables WHERE table_name = 'summaries';
-- SELECT * FROM information_schema.columns WHERE table_name = 'summaries';

-- Migration: Add usage_logs table for analytics
-- Run this in Supabase SQL Editor

-- ============================================
-- USAGE LOGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Action details
    action_type VARCHAR(50) NOT NULL, -- 'scan_pdf', 'generate_flashcards', 'generate_quiz', 'generate_summary', etc
    source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
    chapter_id UUID REFERENCES chapters(id) ON DELETE SET NULL,

    -- File metrics (for uploads/scans)
    file_name VARCHAR(255),
    file_size_bytes INTEGER,
    file_type VARCHAR(50), -- 'pdf', 'txt', 'docx', etc
    pages_count INTEGER,

    -- AI metrics
    tokens_input INTEGER,
    tokens_output INTEGER,
    model_used VARCHAR(100), -- 'anthropic/claude-3.5-sonnet', 'google/gemini-2.0-flash', etc

    -- Cost estimation (in USD, microdollars for precision)
    estimated_cost_usd DECIMAL(10, 6),

    -- Generation metrics
    items_generated INTEGER, -- flashcards count, questions count, etc
    difficulty VARCHAR(20),

    -- Performance
    duration_ms INTEGER, -- time taken for the operation

    -- Status
    status VARCHAR(20) DEFAULT 'success', -- 'success', 'error', 'partial'
    error_message TEXT,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_action_type ON usage_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_action ON usage_logs(user_id, action_type);

-- Composite for dashboard queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_date
ON usage_logs(user_id, created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own logs
CREATE POLICY "Users can view own usage logs" ON usage_logs
    FOR SELECT USING (auth.uid() = user_id);

-- Only service role can insert (API routes)
CREATE POLICY "Service role can insert usage logs" ON usage_logs
    FOR INSERT WITH CHECK (true);

-- ============================================
-- AGGREGATION VIEW (for admin dashboard)
-- ============================================

CREATE OR REPLACE VIEW usage_stats AS
SELECT
    DATE(created_at) as date,
    action_type,
    COUNT(*) as action_count,
    SUM(file_size_bytes) as total_bytes,
    SUM(pages_count) as total_pages,
    SUM(tokens_input + COALESCE(tokens_output, 0)) as total_tokens,
    SUM(estimated_cost_usd) as total_cost_usd,
    SUM(items_generated) as total_items_generated,
    AVG(duration_ms) as avg_duration_ms
FROM usage_logs
WHERE status = 'success'
GROUP BY DATE(created_at), action_type
ORDER BY date DESC, action_type;

-- ============================================
-- USER STATS VIEW
-- ============================================

CREATE OR REPLACE VIEW user_usage_stats AS
SELECT
    user_id,
    action_type,
    COUNT(*) as action_count,
    SUM(file_size_bytes) as total_bytes,
    SUM(pages_count) as total_pages,
    SUM(tokens_input + COALESCE(tokens_output, 0)) as total_tokens,
    SUM(estimated_cost_usd) as total_cost_usd,
    SUM(items_generated) as total_items_generated,
    MAX(created_at) as last_action_at
FROM usage_logs
WHERE status = 'success'
GROUP BY user_id, action_type;

-- ============================================
-- HELPER FUNCTION: Log usage
-- ============================================

CREATE OR REPLACE FUNCTION log_usage(
    p_user_id UUID,
    p_action_type VARCHAR(50),
    p_source_id UUID DEFAULT NULL,
    p_chapter_id UUID DEFAULT NULL,
    p_file_name VARCHAR(255) DEFAULT NULL,
    p_file_size_bytes INTEGER DEFAULT NULL,
    p_file_type VARCHAR(50) DEFAULT NULL,
    p_pages_count INTEGER DEFAULT NULL,
    p_tokens_input INTEGER DEFAULT NULL,
    p_tokens_output INTEGER DEFAULT NULL,
    p_model_used VARCHAR(100) DEFAULT NULL,
    p_estimated_cost_usd DECIMAL(10, 6) DEFAULT NULL,
    p_items_generated INTEGER DEFAULT NULL,
    p_difficulty VARCHAR(20) DEFAULT NULL,
    p_duration_ms INTEGER DEFAULT NULL,
    p_status VARCHAR(20) DEFAULT 'success',
    p_error_message TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO usage_logs (
        user_id, action_type, source_id, chapter_id,
        file_name, file_size_bytes, file_type, pages_count,
        tokens_input, tokens_output, model_used, estimated_cost_usd,
        items_generated, difficulty, duration_ms, status, error_message
    ) VALUES (
        p_user_id, p_action_type, p_source_id, p_chapter_id,
        p_file_name, p_file_size_bytes, p_file_type, p_pages_count,
        p_tokens_input, p_tokens_output, p_model_used, p_estimated_cost_usd,
        p_items_generated, p_difficulty, p_duration_ms, p_status, p_error_message
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- VERIFY MIGRATION
-- ============================================
-- Run: SELECT * FROM information_schema.tables WHERE table_name = 'usage_logs';
-- Run: SELECT * FROM usage_stats LIMIT 10;

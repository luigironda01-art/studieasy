-- Add preferred_model column to chapters for smart AI model selection
ALTER TABLE chapters
ADD COLUMN IF NOT EXISTS preferred_model TEXT DEFAULT NULL;

COMMENT ON COLUMN chapters.preferred_model IS 'AI model best suited for this content type (e.g. gemini-pro for scientific, claude for discursive)';

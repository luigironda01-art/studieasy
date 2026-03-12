-- Add page_count column to chapters table
ALTER TABLE chapters ADD COLUMN IF NOT EXISTS page_count INTEGER DEFAULT NULL;

-- Comment
COMMENT ON COLUMN chapters.page_count IS 'Number of pages/slides in the PDF document';

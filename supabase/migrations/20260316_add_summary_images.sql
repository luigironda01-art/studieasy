-- Table for storing pre-generated AI images for full book summaries
CREATE TABLE IF NOT EXISTS summary_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT NOT NULL,
  position_index INT NOT NULL DEFAULT 0,
  anchor_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by source
CREATE INDEX IF NOT EXISTS idx_summary_images_source_id ON summary_images(source_id);

-- RLS policies
ALTER TABLE summary_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view summary images for their sources"
  ON summary_images FOR SELECT
  USING (
    source_id IN (SELECT id FROM sources WHERE user_id = auth.uid())
  );

CREATE POLICY "Service role can manage summary images"
  ON summary_images FOR ALL
  USING (true)
  WITH CHECK (true);

-- Storage bucket for summary images
INSERT INTO storage.buckets (id, name, public)
VALUES ('summary-images', 'summary-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Anyone can read summary images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'summary-images');

CREATE POLICY "Service role can upload summary images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'summary-images');

CREATE POLICY "Service role can delete summary images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'summary-images');

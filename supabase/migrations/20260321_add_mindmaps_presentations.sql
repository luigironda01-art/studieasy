-- Mindmaps table
CREATE TABLE IF NOT EXISTS mindmaps (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id uuid REFERENCES sources(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES chapters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE mindmaps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own mindmaps"
  ON mindmaps FOR ALL
  USING (auth.uid() = user_id);

-- Presentations table
CREATE TABLE IF NOT EXISTS presentations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id uuid REFERENCES sources(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES chapters(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE presentations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own presentations"
  ON presentations FOR ALL
  USING (auth.uid() = user_id);

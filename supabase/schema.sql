-- Studio App Database Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- PROFILES (extends Supabase Auth)
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT,
  language TEXT DEFAULT 'it' CHECK (language IN ('it', 'en')),
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (new.id, new.raw_user_meta_data->>'display_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- SOURCES (books, PDFs, notes)
-- ============================================
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  author TEXT,
  source_type TEXT CHECK (source_type IN ('book', 'pdf', 'notes')) DEFAULT 'book',
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_sources_user_id ON sources(user_id);

-- ============================================
-- CHAPTERS
-- ============================================
CREATE TABLE IF NOT EXISTS chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  file_url TEXT,  -- URL del file PDF/documento in storage
  raw_text TEXT,
  processed_text TEXT,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'error')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chapters_source_id ON chapters(source_id);

-- ============================================
-- PAGES (scanned/uploaded pages)
-- ============================================
CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
  page_number INTEGER NOT NULL,
  image_url TEXT,
  extracted_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pages_chapter_id ON pages(chapter_id);

-- ============================================
-- FLASHCARDS
-- ============================================
CREATE TABLE IF NOT EXISTS flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ai_generated BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_flashcards_chapter_id ON flashcards(chapter_id);
CREATE INDEX idx_flashcards_user_id ON flashcards(user_id);

-- ============================================
-- REVIEWS (FSRS spaced repetition data)
-- ============================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flashcard_id UUID REFERENCES flashcards(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  -- FSRS fields
  difficulty REAL DEFAULT 0,
  stability REAL DEFAULT 0,
  retrievability REAL DEFAULT 1,
  elapsed_days INTEGER DEFAULT 0,
  scheduled_days INTEGER DEFAULT 0,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  state INTEGER DEFAULT 0, -- 0=New, 1=Learning, 2=Review, 3=Relearning
  -- Timestamps
  due TIMESTAMPTZ DEFAULT now(),
  last_review TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- One review record per flashcard per user
  UNIQUE(flashcard_id, user_id)
);

CREATE INDEX idx_reviews_user_id ON reviews(user_id);
CREATE INDEX idx_reviews_due ON reviews(due);
CREATE INDEX idx_reviews_flashcard_id ON reviews(flashcard_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only access their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Sources: users can only access their own sources
CREATE POLICY "Users can CRUD own sources"
  ON sources FOR ALL
  USING (auth.uid() = user_id);

-- Chapters: users can access chapters of their sources
CREATE POLICY "Users can CRUD chapters of own sources"
  ON chapters FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sources
      WHERE sources.id = chapters.source_id
      AND sources.user_id = auth.uid()
    )
  );

-- Pages: users can access pages of their chapters
CREATE POLICY "Users can CRUD pages of own chapters"
  ON pages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM chapters
      JOIN sources ON sources.id = chapters.source_id
      WHERE chapters.id = pages.chapter_id
      AND sources.user_id = auth.uid()
    )
  );

-- Flashcards: users can access their own flashcards
CREATE POLICY "Users can CRUD own flashcards"
  ON flashcards FOR ALL
  USING (auth.uid() = user_id);

-- Reviews: users can access their own reviews
CREATE POLICY "Users can CRUD own reviews"
  ON reviews FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- STORAGE BUCKETS
-- ============================================
-- Create buckets in Supabase Dashboard > Storage:
-- 1. 'documents' - for PDFs and scanned pages
-- 2. 'covers' - for book cover images

-- Then run these policies in SQL Editor:

-- Policy per upload documenti
CREATE POLICY "Users can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy per lettura documenti
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy per eliminazione documenti
CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy per covers (stessa logica)
CREATE POLICY "Users can upload own covers"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can read own covers"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'covers'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sources_updated_at
  BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chapters_updated_at
  BEFORE UPDATE ON chapters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_flashcards_updated_at
  BEFORE UPDATE ON flashcards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

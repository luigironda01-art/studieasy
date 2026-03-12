-- Quiz Tables Schema
-- Run this in Supabase SQL Editor

-- ============================================
-- QUIZZES (quiz sessions)
-- ============================================
CREATE TABLE IF NOT EXISTS quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  total_questions INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_quizzes_chapter_id ON quizzes(chapter_id);
CREATE INDEX idx_quizzes_user_id ON quizzes(user_id);

-- ============================================
-- QUIZ_QUESTIONS
-- ============================================
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE NOT NULL,
  question_type TEXT CHECK (question_type IN ('multiple_choice', 'true_false', 'open_ended')) NOT NULL,
  question TEXT NOT NULL,
  options JSONB, -- For multiple choice: ["option1", "option2", "option3", "option4"]
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  order_index INTEGER DEFAULT 0,
  -- User response
  user_answer TEXT,
  is_correct BOOLEAN,
  ai_feedback TEXT, -- For open-ended questions
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

-- Quizzes: users can access their own quizzes
CREATE POLICY "Users can CRUD own quizzes"
  ON quizzes FOR ALL
  USING (auth.uid() = user_id);

-- Quiz questions: users can access questions of their quizzes
CREATE POLICY "Users can CRUD own quiz questions"
  ON quiz_questions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM quizzes
      WHERE quizzes.id = quiz_questions.quiz_id
      AND quizzes.user_id = auth.uid()
    )
  );

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE TRIGGER update_quizzes_updated_at
  BEFORE UPDATE ON quizzes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

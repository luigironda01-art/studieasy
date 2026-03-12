import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Only create client if we have valid credentials
const createSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase credentials");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
};

export const supabase = createSupabaseClient();

// Types for database tables
export interface Profile {
  id: string;
  display_name: string | null;
  language: "it" | "en";
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

export interface Source {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  source_type: "book" | "pdf" | "notes";
  cover_url: string | null;
  topic_emoji: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  source_id: string;
  title: string;
  order_index: number;
  file_url: string | null;
  raw_text: string | null;
  processed_text: string | null;
  processing_status: "pending" | "processing" | "completed" | "error";
  page_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  chapter_id: string;
  page_number: number;
  image_url: string | null;
  extracted_text: string | null;
  created_at: string;
}

export interface Flashcard {
  id: string;
  chapter_id: string;
  user_id: string;
  front: string;
  back: string;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  flashcard_id: string;
  user_id: string;
  // FSRS fields
  difficulty: number;
  stability: number;
  retrievability: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number; // 0=New, 1=Learning, 2=Review, 3=Relearning
  due: string;
  last_review: string | null;
  created_at: string;
  updated_at: string;
}

export interface Quiz {
  id: string;
  chapter_id: string;
  user_id: string;
  title: string;
  total_questions: number;
  score: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question_type: "multiple_choice" | "true_false" | "open_ended";
  question: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  order_index: number;
  user_answer: string | null;
  is_correct: boolean | null;
  ai_feedback: string | null;
  answered_at: string | null;
  created_at: string;
}

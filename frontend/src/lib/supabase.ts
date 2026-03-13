import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Lazy initialization - client is created on first access, not at module load time
let _supabase: SupabaseClient | null = null;

const getSupabaseClient = (): SupabaseClient => {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing Supabase credentials. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  _supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  return _supabase;
};

// Export a getter that creates the client lazily
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient];
  },
});

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
  extraction_quality: number | null;
  extraction_method: "text" | "vision" | "hybrid" | "failed" | null;
  extraction_notes: string | null;
  chars_extracted: number | null;
  processing_progress: number;
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
  difficulty: "easy" | "medium" | "hard" | null;
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

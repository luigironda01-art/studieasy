import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for database tables
export interface Profile {
  id: string;
  display_name: string | null;
  language: "it" | "en";
  onboarding_completed: boolean;
  created_at: string;
}

export interface Source {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  source_type: "book" | "pdf" | "notes";
  cover_url: string | null;
  created_at: string;
}

export interface Chapter {
  id: string;
  source_id: string;
  title: string;
  order_index: number;
  raw_text: string | null;
  processed_text: string | null;
  created_at: string;
}

export interface Flashcard {
  id: string;
  chapter_id: string;
  front: string;
  back: string;
  ai_generated: boolean;
  created_at: string;
}

export interface Review {
  id: string;
  flashcard_id: string;
  user_id: string;
  difficulty: number;
  stability: number;
  retrievability: number;
  next_review: string | null;
  last_review: string | null;
  reps: number;
  lapses: number;
  state: "new" | "learning" | "review" | "relearning";
}

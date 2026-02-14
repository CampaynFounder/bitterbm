import { createClient, SupabaseClient } from "@supabase/supabase-js"

// Placeholders for static build when env vars not set (e.g. CI)
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co"
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-key"

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey)

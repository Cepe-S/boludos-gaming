import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

/**
 * Checks whether valid Supabase environment variables are provided.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    supabaseUrl &&
      supabaseAnonKey &&
      (supabaseUrl.startsWith('https://') || supabaseUrl.startsWith('http://')) &&
      supabaseAnonKey.length > 20
  );
}

/**
 * Safe Supabase client instance.
 * Returns null if environment variables are not configured,
 * allowing the application to operate in 100% free Local/Demo mode seamlessly.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ||
  'https://gymtxeezjvsewtjrdjtx.supabase.co';

export const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ||
  'sb_publishable_Urra9B3Sf5RXVJH8HVSj_Q_HUt8POTq';

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
 * Checks whether the Discord OAuth2 external provider is enabled in the Supabase project settings.
 * Prevents navigation to broken /auth/v1/authorize?provider=discord error pages when Discord OAuth is not configured.
 */
export async function isDiscordOAuthProviderEnabled(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        apikey: supabaseAnonKey,
      },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.external?.discord);
  } catch (error) {
    console.warn('Error checking Discord OAuth provider status:', error);
    return false;
  }
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

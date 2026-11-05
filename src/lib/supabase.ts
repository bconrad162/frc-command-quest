import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase is optional. Without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY the game
 * runs in local demonstration mode (browser-only progress, device-only leaderboard).
 * Only the public anon key is ever used in the browser.
 */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || ''
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''

export const isBackendConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

let clientPromise: Promise<SupabaseClient> | null = null

/** Lazily loads supabase-js so demo mode never downloads it. */
export function getSupabase(): Promise<SupabaseClient> {
  if (!isBackendConfigured) return Promise.reject(new Error('Backend not configured'))
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'command-quest-auth' },
        realtime: { params: { eventsPerSecond: 5 } },
      }),
    )
  }
  return clientPromise
}

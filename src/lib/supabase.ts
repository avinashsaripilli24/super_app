import { createClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/database.types'

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
// A path ("/") means Supabase is proxied on the app's own origin by the Vite
// server (vite.config.ts), e.g. for a phone preview over the LAN.
const url = rawUrl?.startsWith('/') ? new URL(rawUrl, window.location.origin).href : rawUrl
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill it from `npx supabase status -o env`.',
  )
}

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

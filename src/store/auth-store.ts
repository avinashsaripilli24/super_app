import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'

import type { Tables } from '@/lib/database.types'
import { phoneToAuthEmail } from '@/lib/phone'
import { supabase } from '@/lib/supabase'

export type Profile = Tables<'profiles'>
export type AuthStatus = 'loading' | 'signedOut' | 'signedIn'

export interface AuthState {
  status: AuthStatus
  session: Session | null
  profile: Profile | null
  /** Set once the auth store has been hydrated. */
  init: () => () => void
  /** `phone` is E.164 (`mobileSchema` output). */
  signIn: (phone: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) {
    console.error('Failed to load profile', error)
    return null
  }
  return data
}

export const useAuthStore = create<AuthState>((set, get) => {
  let initialised = false

  async function hydrate(session: Session | null) {
    if (!session) {
      set({ status: 'signedOut', session: null, profile: null })
      return
    }
    const profile = await loadProfile(session.user.id)
    if (profile && !profile.is_active) {
      // Deactivated by an admin: drop the session immediately.
      await supabase.auth.signOut()
      set({ status: 'signedOut', session: null, profile: null })
      return
    }
    set({ status: 'signedIn', session, profile })
  }

  return {
    status: 'loading',
    session: null,
    profile: null,

    init: () => {
      if (initialised) return () => {}
      initialised = true

      void supabase.auth.getSession().then(({ data }) => hydrate(data.session))

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        // Never await supabase calls inside this callback (documented
        // deadlock); defer to the next tick.
        if (event === 'TOKEN_REFRESHED') {
          set({ session })
          return
        }
        setTimeout(() => void hydrate(session), 0)
      })

      return () => {
        subscription.unsubscribe()
        initialised = false
      }
    },

    signIn: async (phone, password) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: phoneToAuthEmail(phone),
        password,
      })
      if (error) throw error
      await hydrate(data.session)
      if (get().status !== 'signedIn') {
        throw new Error('This account has been deactivated. Contact your administrator.')
      }
    },

    signOut: async () => {
      await supabase.auth.signOut()
      set({ status: 'signedOut', session: null, profile: null })
    },

    refreshProfile: async () => {
      const session = get().session
      if (!session) return
      const profile = await loadProfile(session.user.id)
      set({ profile })
    },
  }
})

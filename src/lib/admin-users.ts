import { FunctionsHttpError } from '@supabase/supabase-js'

import type { Enums, Tables } from '@/lib/database.types'
import { likePattern } from '@/lib/postgrest'
import { supabase } from '@/lib/supabase'

export type UserProfile = Tables<'profiles'>
export type AppRole = Enums<'app_role'>

type AdminAction =
  | { action: 'create'; email: string; password: string; full_name: string; role: AppRole }
  | { action: 'deactivate'; user_id: string }
  | { action: 'reactivate'; user_id: string }
  | { action: 'reset_password'; user_id: string; password: string }

async function invoke<T>(body: AdminAction): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>('admin-users', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(payload?.error ?? 'Request failed')
    }
    throw new Error(error.message)
  }
  return data as T
}

/** One page of profiles, newest first, optionally filtered by name/email. */
export async function listUsersPage(
  { offset, limit, search }: { offset: number; limit: number; search: string },
  signal?: AbortSignal,
): Promise<UserProfile[]> {
  let q = supabase.from('profiles').select('*')
  const term = search.trim()
  if (term) q = q.or(`full_name.ilike.${likePattern(term)},email.ilike.${likePattern(term)}`)
  q = q
    .order('created_at', { ascending: false })
    .order('id')
    .range(offset, offset + limit - 1)
  if (signal) q = q.abortSignal(signal)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}

export function createUser(input: { email: string; password: string; full_name: string; role: AppRole }) {
  return invoke<{ user_id: string }>({ action: 'create', ...input })
}

export function deactivateUser(user_id: string) {
  return invoke<{ ok: true }>({ action: 'deactivate', user_id })
}

export function reactivateUser(user_id: string) {
  return invoke<{ ok: true }>({ action: 'reactivate', user_id })
}

export function resetUserPassword(user_id: string, password: string) {
  return invoke<{ ok: true }>({ action: 'reset_password', user_id, password })
}

/** Random, readable temporary password (letters, digits, one symbol). */
export function generateTempPassword(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length - 1; i++) out += alphabet[bytes[i]! % alphabet.length]
  return out + '!'
}

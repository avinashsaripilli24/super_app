import { z } from 'zod'

// Users sign in with an Indian mobile number + password. No SMS is involved:
// each number maps to an internal auth email (phoneToAuthEmail) and Supabase
// does ordinary email+password auth. profiles.phone (E.164) is the identity
// shown in the UI. The admin-users edge function keeps its own copy of
// normalizeMobile / phoneToAuthEmail; keep the two in sync.

/** `+91XXXXXXXXXX` for a valid Indian mobile (optional +91 / 91 / 0 prefix, spaces, dashes), else null. */
export function normalizeMobile(input: string): string | null {
  let digits = input.replace(/[\s()-]/g, '')
  if (digits.startsWith('+91')) digits = digits.slice(3)
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null
}

/** Validates a typed mobile number and outputs it as E.164. */
export const mobileSchema = z
  .string()
  .trim()
  .refine((v) => normalizeMobile(v) !== null, 'Enter a 10-digit mobile number')
  .transform((v) => normalizeMobile(v) as string)

/** The auth email behind a mobile number. Never shown, never mailed. */
export function phoneToAuthEmail(e164: string): string {
  return `${e164.replace(/^\+/, '')}@phone.superapp.local`
}

/** `+91 98765 43210` for display; anything unexpected is returned as-is. */
export function formatPhone(e164: string | null | undefined): string | null {
  if (!e164) return null
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164)
  return m ? `+91 ${m[1]} ${m[2]}` : e164
}

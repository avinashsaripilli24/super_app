import { useSyncExternalStore } from 'react'

/**
 * Device-only lock shared by the app-open lock and the Assets lock: a PIN
 * (PBKDF2 hash) plus an optional WebAuthn platform credential (fingerprint /
 * Face ID), stored per user in localStorage. It is a privacy gate on this
 * device, not access control: RLS still decides what the API returns.
 */

/**
 * Both locks (app open + Assets) are skipped on the Vite dev server so the app
 * can be tested without unlocking; `VITE_APP_LOCK=on` in `.env.local` brings
 * them back. Production builds always lock.
 */
export const locksEnabled = !import.meta.env.DEV || import.meta.env.VITE_APP_LOCK === 'on'

export const PIN_MIN = 4
export const PIN_MAX = 6
/** Wrong PINs allowed before only biometrics or the account password can unlock. */
export const MAX_ATTEMPTS = 5

const KEY_PREFIX = 'super-app-lock:'
const ITERATIONS = 210_000

export interface LockRecord {
  salt: string
  hash: string
  iterations: number
  /** Digits in the PIN, so the unlock field can submit on the last one. */
  length: number
  failed: number
  /** base64url rawId of the WebAuthn credential, when biometrics are on. */
  credentialId?: string
}

export type PinResult = { ok: true } | { ok: false; remaining: number }

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>()

function notify() {
  for (const l of listeners) l()
}

function readRaw(userId: string): string | null {
  try {
    return localStorage.getItem(KEY_PREFIX + userId)
  } catch {
    return null
  }
}

function parse(raw: string | null): LockRecord | null {
  if (!raw) return null
  try {
    const r = JSON.parse(raw) as LockRecord
    return typeof r.hash === 'string' && typeof r.salt === 'string' ? r : null
  } catch {
    return null
  }
}

export function readLock(userId: string): LockRecord | null {
  return parse(readRaw(userId))
}

function writeLock(userId: string, record: LockRecord) {
  try {
    localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(record))
  } catch {
    throw new Error('Could not save the lock on this device (storage is blocked).')
  }
  notify()
}

export function clearLock(userId: string) {
  try {
    localStorage.removeItem(KEY_PREFIX + userId)
  } catch {
    // ignore
  }
  notify()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(KEY_PREFIX)) listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** The user's lock record on this device; re-renders when it changes (also from other tabs). */
export function useLockRecord(userId: string | undefined): LockRecord | null {
  const raw = useSyncExternalStore(subscribe, () => (userId ? readRaw(userId) : null))
  return parse(raw)
}

export function attemptsLeft(record: LockRecord) {
  return Math.max(0, MAX_ATTEMPTS - record.failed)
}

// ---------------------------------------------------------------------------
// PIN
// ---------------------------------------------------------------------------

/** Web Crypto (and WebAuthn) only exist on https:// or localhost. */
export function lockSupported() {
  return typeof window !== 'undefined' && window.isSecureContext && !!globalThis.crypto?.subtle
}

function toB64(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(b64: string) {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

const toB64Url = (bytes: Uint8Array) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64Url = (s: string) => fromB64(s.replace(/-/g, '+').replace(/_/g, '/'))

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return new Uint8Array(bits)
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Set (or change) the PIN. Keeps an enrolled biometric credential and clears failed attempts. */
export async function setPin(userId: string, pin: string) {
  if (!lockSupported()) throw new Error('The app lock needs HTTPS or localhost.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(pin, salt, ITERATIONS)
  const existing = readLock(userId)
  writeLock(userId, {
    salt: toB64(salt),
    hash: toB64(hash),
    iterations: ITERATIONS,
    length: pin.length,
    failed: 0,
    ...(existing?.credentialId ? { credentialId: existing.credentialId } : {}),
  })
}

export async function verifyPin(userId: string, pin: string): Promise<PinResult> {
  const record = readLock(userId)
  if (!record) return { ok: false, remaining: 0 }
  if (record.failed >= MAX_ATTEMPTS) return { ok: false, remaining: 0 }
  const hash = await derive(pin, fromB64(record.salt), record.iterations)
  // Re-read: another verify may have run while this one was hashing.
  const current = readLock(userId) ?? record
  if (sameBytes(hash, fromB64(record.hash))) {
    if (current.failed) writeLock(userId, { ...current, failed: 0 })
    return { ok: true }
  }
  const failed = current.failed + 1
  writeLock(userId, { ...current, failed })
  return { ok: false, remaining: Math.max(0, MAX_ATTEMPTS - failed) }
}

// ---------------------------------------------------------------------------
// Biometrics (WebAuthn platform authenticator)
// ---------------------------------------------------------------------------

// Some devices hide the page while the OS fingerprint / Face ID prompt is up;
// the app lock must not re-lock because of that.
let pendingPrompts = 0

export function biometricPending() {
  return pendingPrompts > 0
}

async function withPrompt<T>(prompt: () => Promise<T>): Promise<T> {
  pendingPrompts++
  try {
    return await prompt()
  } finally {
    pendingPrompts--
  }
}

/** WebAuthn refuses IP-address origins (e.g. http://192.168.x.x from `npm run dev:lan`). */
function isIpHost(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')
}

export async function biometricAvailable(): Promise<boolean> {
  try {
    if (!lockSupported() || typeof PublicKeyCredential === 'undefined') return false
    if (isIpHost(location.hostname)) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/** True when the user cancelled, the prompt timed out or the browser wanted a tap first. */
export function isBiometricCancel(err: unknown) {
  return err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')
}

export async function enrollBiometric(user: { id: string; phone?: string | null; name?: string | null }) {
  const record = readLock(user.id)
  if (!record) throw new Error('Set a PIN first.')
  const cred = (await withPrompt(() =>
    navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Super App' },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.phone || user.id,
          displayName: user.name || user.phone || 'Super App',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'discouraged',
        },
        timeout: 60_000,
        attestation: 'none',
      },
    }),
  )) as PublicKeyCredential | null
  if (!cred) throw new Error('Fingerprint / Face ID was not set up.')
  writeLock(user.id, { ...(readLock(user.id) ?? record), credentialId: toB64Url(new Uint8Array(cred.rawId)) })
}

/**
 * Ask the platform authenticator to verify the user. Resolves true only when
 * the stored credential answered with the user-verified flag set; a correct
 * answer also clears failed PIN attempts. Throws on cancel (see
 * `isBiometricCancel`).
 */
export async function verifyBiometric(userId: string): Promise<boolean> {
  const record = readLock(userId)
  if (!record?.credentialId) return false
  const credentialId = record.credentialId
  const cred = (await withPrompt(() =>
    navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: fromB64Url(credentialId), transports: ['internal'] }],
        userVerification: 'required',
        timeout: 60_000,
      },
    }),
  )) as PublicKeyCredential | null
  if (!cred || toB64Url(new Uint8Array(cred.rawId)) !== record.credentialId) return false
  const authData = new Uint8Array((cred.response as AuthenticatorAssertionResponse).authenticatorData)
  // Flags byte follows the 32-byte rpIdHash; bit 2 = user verified.
  if (authData.length < 33 || !(authData[32] & 0x04)) return false
  const current = readLock(userId)
  if (current?.failed) writeLock(userId, { ...current, failed: 0 })
  return true
}

export function disableBiometric(userId: string) {
  const record = readLock(userId)
  if (!record?.credentialId) return
  const next = { ...record }
  delete next.credentialId
  writeLock(userId, next)
}

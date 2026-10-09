// Web Push on this device: subscribe through the service worker (src/sw.ts),
// store the subscription with register_push_subscription, and ask the
// `notify` edge function for a test. Reminders themselves are sent by the
// database on a schedule (supabase/migrations/*_push_notifications.sql).

import { FunctionsHttpError } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type TestSample = 'daily' | 'budget' | 'recurring'

/** Why this device can't get notifications, or null when it can. */
export function pushUnsupportedReason(): string | null {
  if (!window.isSecureContext) return 'Notifications need https:// or localhost.'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'This browser can’t receive notifications. Use Chrome on Android.'
  }
  if (!vapidKey) return 'Notifications aren’t set up for this app yet (VITE_VAPID_PUBLIC_KEY is missing).'
  return null
}

export function pushSupported() {
  return pushUnsupportedReason() === null
}

export function pushPermission(): NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'denied'
}

/** The active service worker registration; `ready` never settles if none registers, hence the timeout. */
async function registration(timeoutMs = 5000): Promise<ServiceWorkerRegistration> {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('The app’s service worker is not running. Reload and try again.')), timeoutMs),
    ),
  ])
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  // getRegistration, not ready: answers at once when no worker is registered.
  const reg = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL)
  return reg ? reg.pushManager.getSubscription() : null
}

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function register(sub: PushSubscription) {
  const keys = sub.toJSON().keys
  if (!keys?.p256dh || !keys.auth) throw new Error('This browser returned an incomplete subscription')
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: keys.p256dh,
    p_auth_secret: keys.auth,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw new Error(error.message)
}

export type EnableStep = 'permission' | 'subscribing' | 'saving'

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ])
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// Lets the Settings card follow a change made from the prompt sheet (and back).
const listeners = new Set<() => void>()
export function onPushChange(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
const emitChange = () => listeners.forEach((l) => l())

let enabling: Promise<void> | null = null

/**
 * Asks for permission (call from a tap), subscribes this device and stores it.
 * Registering with the push service can take several seconds on a phone, so
 * `onStep` reports progress. A second call while one runs joins the first.
 */
export function enablePush(onStep?: (step: EnableStep) => void): Promise<void> {
  enabling ??= doEnable(onStep).finally(() => {
    enabling = null
  })
  return enabling
}

async function doEnable(onStep?: (step: EnableStep) => void) {
  if (!pushSupported()) throw new Error('Notifications are not supported in this browser')
  onStep?.('permission')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notifications are blocked. Allow them for this site in Chrome’s settings.')
  }
  onStep?.('subscribing')
  const reg = await registration()
  const options = { userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidKey!) }
  const subscribe = async () => {
    try {
      return await reg.pushManager.subscribe(options)
    } catch (err) {
      // Subscribed earlier with a different server key: start over.
      if (!(err instanceof DOMException && err.name === 'InvalidStateError')) throw err
      await (await reg.pushManager.getSubscription())?.unsubscribe()
      return reg.pushManager.subscribe(options)
    }
  }
  // Reuse this device's subscription when it was made with the current key
  // (fast: no round trip to the push service).
  const existing = await reg.pushManager.getSubscription()
  const sameKey =
    existing?.options.applicationServerKey &&
    sameBytes(new Uint8Array(existing.options.applicationServerKey), options.applicationServerKey)
  const sub =
    (sameKey ? existing : null) ??
    (await withTimeout(
      subscribe(),
      30_000,
      'Couldn’t reach Google’s notification service. Check your connection and try again.',
    ))
  onStep?.('saving')
  await withTimeout(register(sub), 20_000, 'Saving took too long. Check your connection and try again.')
  emitChange()
}

/** Stops notifications on this device (removes the stored row, then unsubscribes). */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
  emitChange()
}

/** True when this device is subscribed and the stored row belongs to the signed-in user. */
export async function isPushEnabled(): Promise<boolean> {
  if (pushPermission() !== 'granted') return false
  const sub = await currentSubscription()
  if (!sub) return false
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id')
    .eq('endpoint', sub.endpoint)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return !!data
}

/**
 * On sign-in: if this device is already subscribed, (re)claim it for this
 * user and refresh its keys. Never prompts.
 */
export async function syncPush(): Promise<void> {
  if (!pushSupported() || pushPermission() !== 'granted') return
  const sub = await currentSubscription()
  if (sub) await register(sub)
}

/** Sends one sample notification to this device only. Resolves to how many were delivered (0 or 1). */
export async function sendTestPush(sample: TestSample): Promise<number> {
  const sub = await currentSubscription()
  if (!sub) throw new Error('Notifications are off on this device')
  const { data, error } = await supabase.functions.invoke<{ sent: number }>('notify', {
    body: { kind: 'test', endpoint: sub.endpoint, sample },
  })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(payload?.error ?? 'Request failed')
    }
    throw new Error(error.message)
  }
  return data?.sent ?? 0
}

/** Shows a notification straight from the service worker, without the server. */
export async function showLocalTest(): Promise<void> {
  const reg = await registration()
  await reg.showNotification('Test · Super App', {
    body: 'This phone can show notifications.',
    tag: 'local-test',
    icon: `${import.meta.env.BASE_URL}icons/pwa-192.png`,
    badge: `${import.meta.env.BASE_URL}icons/badge-96.png`,
    data: { url: 'expenses' },
  })
}

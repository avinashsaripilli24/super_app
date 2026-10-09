/// <reference lib="webworker" />
// Service worker (vite-plugin-pwa injectManifest). Precaches the app shell
// and shows Web Push notifications sent by the `notify` edge function.
// Runs outside the app bundle: no `@/` imports.

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// Never serve the app shell for backend paths (matters if Supabase is ever
// proxied on the same origin). No runtime caching of Supabase REST: per-user
// data must always be fresh.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), {
    denylist: [/^\/functions\//, /^\/auth\//, /^\/rest\//, /^\/storage\//, /^\/realtime\//],
  }),
)

// registerType: 'autoUpdate' — take over as soon as a new version installs.
self.skipWaiting()
clientsClaim()
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

interface PushPayload {
  title?: string
  body?: string
  tag?: string
  /** Relative to the SW scope (e.g. "expenses?add=1"), so the server never needs the base path. */
  url?: string
}

const scope = () => self.registration.scope

self.addEventListener('push', (event) => {
  let payload: PushPayload
  try {
    payload = (event.data?.json() as PushPayload | undefined) ?? {}
  } catch {
    // DevTools' "Push" button sends plain text.
    payload = { body: event.data?.text() }
  }
  const title = payload.title ?? 'Super App'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? 'Have you updated all your expenses?',
      tag: payload.tag,
      // A replaced notification (same tag) still buzzes.
      ...(payload.tag ? { renotify: true } : {}),
      icon: new URL('icons/pwa-192.png', scope()).href,
      badge: new URL('icons/badge-96.png', scope()).href,
      data: { url: payload.url ?? 'expenses?add=1' },
    } as NotificationOptions),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data as { url?: string } | undefined
  const target = new URL(data?.url ?? 'expenses?add=1', scope()).href

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((c) => c.url.startsWith(scope()))
      if (open) {
        // Navigate in-app (no reload) so whatever was open stays mounted.
        await open.focus()
        open.postMessage({ type: 'notification-navigate', url: target })
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})

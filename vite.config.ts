import path from 'node:path'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

// Local Supabase on the app's own origin, so a phone previewing over the LAN
// needs just one address, whatever this PC's IP is. Used when VITE_SUPABASE_URL
// is a path ("/"); see README "Installing on a phone".
const supabaseProxy = Object.fromEntries(
  ['/auth/v1', '/rest/v1', '/functions/v1', '/storage/v1', '/realtime/v1'].map((p) => [
    p,
    { target: 'http://127.0.0.1:54321', changeOrigin: true, ws: p === '/realtime/v1' },
  ]),
)

// Path the app is served under. "/" locally; the GitHub Pages workflow sets
// BASE_PATH=/<repo>/ because a project site lives at <user>.github.io/<repo>/.
// The router reads it back as import.meta.env.BASE_URL.
const base = process.env.BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Super App',
        short_name: 'SuperApp',
        description: 'Expense tracker, user management and more in one installable app.',
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // Never serve the app shell for backend paths (matters if Supabase is
        // ever proxied on the same origin). No runtime caching of Supabase
        // REST in v1: per-user data must always be fresh.
        navigateFallbackDenylist: [
          /^\/functions\//,
          /^\/auth\//,
          /^\/rest\//,
          /^\/storage\//,
          /^\/realtime\//,
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: supabaseProxy,
  },
  preview: {
    proxy: supabaseProxy,
  },
})

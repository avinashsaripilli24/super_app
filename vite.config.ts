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
      // Custom service worker (src/sw.ts) so it can show push notifications;
      // it precaches the same files the generated one did.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
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
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
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

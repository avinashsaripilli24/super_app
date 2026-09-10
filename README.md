# Super App

Installable, mobile-first PWA with a Supabase backend. Ships with five modules: Dashboard, Expense Tracker (mock data model: a shared ledger with "Added by", monthly and yearly analytics, and Excel export by month / year / custom range), Assets & Debts (household net worth: holdings of every asset and debt type with buys / sales / repayments, recorded current values, per-type targets, month / year activity, a net-worth trend, XIRR and Excel export), User Management (admin only) and Settings.

## Stack

React 19 · Vite · TypeScript · Tailwind 4 · shadcn/ui · TanStack Router · react-hook-form + zod · zustand · Supabase (Postgres, Auth, Edge Functions) · vite-plugin-pwa

## Prerequisites

- Node 20+ and npm
- Docker Desktop (for local Supabase)

## First run

```powershell
npm install

# 1. Start local Supabase (first time pulls Docker images; takes a few minutes)
npm run db:start

# 2. Apply migrations + seed (creates the default admin; no other data)
npm run db:reset

# 3. Create .env from the running stack
npx supabase status -o env | Select-String 'ANON_KEY'
#   -> copy .env.example to .env and paste the key as VITE_SUPABASE_ANON_KEY.
#      Keep VITE_SUPABASE_URL=http://localhost:54321 (not 127.0.0.1: Chrome
#      blocks localhost pages from calling 127.0.0.1).

# 4. Serve the edge function (separate terminal, keep it running)
npm run fn:serve

# 5. Run the app
npm run dev
```

Open http://localhost:5173 and sign in with the default admin:

| Mobile number | Password   | Role  |
| ------------- | ---------- | ----- |
| 9999999999    | Admin@1234 | admin |

Both are placeholders and this repo is public: right after the first sign-in, change the number (**Users** → ⋮ → **Change mobile number**) and the password (**Settings**). Everyone signs in with a mobile number and password (no SMS; see `src/lib/phone.ts`). Other users are created from **Users** (admin only) with a mobile number and a temporary password. The expense ledger is shared: everyone sees every transaction with who added it; only the creator or an admin can edit or delete a row.

Local tooling: Studio http://localhost:54323 · Mailpit http://localhost:54324

## Scripts

| Script              | What it does                                      |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Vite dev server (PWA enabled in dev)              |
| `npm run dev:lan`   | Same, reachable from phones on the Wi-Fi          |
| `npm run build`     | Type-check and production build                   |
| `npm run preview`   | Serve the production build                        |
| `npm run lint`      | ESLint                                            |
| `npm run db:start`  | Start local Supabase                              |
| `npm run db:stop`   | Stop local Supabase                               |
| `npm run db:reset`  | Drop + re-apply migrations + seed                 |
| `npm run db:status` | Show local URLs and keys                          |
| `npm run db:types`  | Regenerate `src/lib/database.types.ts`            |
| `npm run fn:serve`  | Serve edge functions locally with hot reload      |

## Project layout

```
supabase/
  config.toml            local stack config (signup disabled, analytics off)
  seed.sql               the default admin only (local and, once, hosted)
  migrations/            schema + RLS
  functions/admin-users  create / deactivate / reactivate / reset-password / set-phone
src/
  lib/                   supabase client, admin-users client, db types, utils
  store/auth-store.ts    session + profile (zustand)
  router.tsx             routes and guards
  components/            app shell, PWA install/update, shadcn ui
  modules/
    registry.ts          single list that drives nav, tiles and role visibility
    dashboard/ expenses/ assets/ users/ settings/
```

## Installing on a phone

Service workers only register on `https://` or `localhost`. Options:

- **Android (Chrome) over Wi-Fi**: put `VITE_SUPABASE_URL=/` in `.env.local` (the dev server then proxies Supabase on its own origin, so the phone needs one address) and run `npm run dev:lan`. On the phone, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enter `http://<PC-IP>:5173` (the "Network" URL Vite prints), set it to **Enabled** and tap **Relaunch**. Open that URL: the "Install Super App" banner appears (also Chrome ⋮ → **Install app**, or Settings → Install app). Update the flag if the PC's IP changes.
- **Android (Chrome) over USB**: connect by USB, open `chrome://inspect`, add port forwarding `5173 → localhost:5173` and `54321 → localhost:54321`, then open http://localhost:5173 on the phone. Chrome will offer "Install app".
- **iOS (Safari)**: needs HTTPS. Use a tunnel (Cloudflare Tunnel / ngrok) for both the app and the Supabase API, set `VITE_SUPABASE_URL` to the tunnelled API URL, then Share → Add to Home Screen.
- **Desktop**: Chrome/Edge show an install icon in the address bar at http://localhost:5173.

## Regenerating icons

```powershell
powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
```

## Deploying to hosted Supabase

```powershell
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push --include-seed
npx supabase functions deploy admin-users
```

`--include-seed` creates the default admin (9999999999 / Admin@1234) on the hosted project; the seed holds nothing else. Sign in on the live site straight away and change both the number and the password, since both are public in this repo. Re-running the seed never resets them.

## Hosting on GitHub Pages

`.github/workflows/deploy-pages.yml` builds and publishes the app to https://avinashsaripilli24.github.io/super_app/ on every push to `main` (or run it by hand from the Actions tab). The build sets `BASE_PATH=/super_app/`, which becomes Vite's `base`, the router's `basepath` and the PWA scope, and copies `index.html` to `404.html` so deep links survive a reload. One-time setup in the repo's **Settings**:

1. **Pages** → Build and deployment → Source: **GitHub Actions**.
2. **Secrets and variables → Actions → Variables**: add `VITE_SUPABASE_URL` (`https://<ref>.supabase.co`) and `VITE_SUPABASE_ANON_KEY` from the hosted project (Project Settings → API). The workflow refuses to build without them.
3. In the hosted Supabase project, **Authentication → URL Configuration**: set the Site URL to `https://avinashsaripilli24.github.io/super_app/`.

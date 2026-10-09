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
npx supabase functions deploy notify
```

`--include-seed` creates the default admin (9999999999 / Admin@1234) on the hosted project; the seed holds nothing else. Sign in on the live site straight away and change both the number and the password, since both are public in this repo. Re-running the seed never resets them.

## Notifications

Android Chrome gets Web Push reminders ("Have you updated all your expenses?") at **1 pm and 10 pm IST**, budget alerts at 80% / 100%, and recurring expenses on their day. Each person turns them on per device in **Settings → Notifications** (or from the Dashboard banner), where they can also send test notifications to that phone. Push needs https or `localhost`, so it can't be tried over `dev:lan`.

How it runs: `pg_cron` (UTC) and a trigger on `transactions` call `public.notify_dispatch()`, which POSTs through `pg_net` to the `notify` edge function, which sends to every row in `push_subscriptions`. The function URL and a shared secret live in **Supabase Vault**, never in the repo; until they are set, dispatch logs and does nothing.

**One-time setup per environment.**

1. Generate a VAPID key pair and a random secret (keep the private key secret):

   ```powershell
   npx web-push generate-vapid-keys
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Edge function secrets. Locally, `supabase/functions/.env` (gitignored, read by `npm run fn:serve`):

   ```
   NOTIFY_SECRET=<random hex>
   VAPID_PUBLIC_KEY=<public key>
   VAPID_PRIVATE_KEY=<private key>
   VAPID_SUBJECT=mailto:<an address you own>
   ```

   Hosted: `npx supabase secrets set NOTIFY_SECRET=… VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:…`

3. The app's copy of the public key: `VITE_VAPID_PUBLIC_KEY=<public key>` in `.env` locally, and as a repository **Variable** of the same name for the Pages build. Without it the Settings card says notifications aren't set up.

4. Vault, in the SQL editor (Studio locally). Use the same secret as `NOTIFY_SECRET`:

   ```sql
   -- Hosted
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify', 'notify_url');
   -- Local (the database reaches the function through the Docker network)
   select vault.create_secret('http://supabase_kong_super_app:8000/functions/v1/notify', 'notify_url');

   select vault.create_secret('<random hex>', 'notify_secret');
   ```

   `npm run db:reset` wipes the vault, so repeat this locally after a reset. To change a value: `select vault.update_secret((select id from vault.secrets where name = 'notify_url'), '<new value>');`

Check it: `select public.notify_dispatch('daily');` sends the reminder now; `select * from net._http_response order by id desc limit 5;` shows the function's replies, and `select * from cron.job_run_details order by start_time desc limit 5;` the scheduled runs. Rotating the VAPID keys invalidates every subscription: people turn notifications off and on again.

## Hosting on GitHub Pages

`.github/workflows/deploy-pages.yml` builds and publishes the app to https://avinashsaripilli24.github.io/super_app/ on every push to `main` (or run it by hand from the Actions tab). The build sets `BASE_PATH=/super_app/`, which becomes Vite's `base`, the router's `basepath` and the PWA scope, and copies `index.html` to `404.html` so deep links survive a reload. One-time setup in the repo's **Settings**:

1. **Pages** → Build and deployment → Source: **GitHub Actions**.
2. **Secrets and variables → Actions → Variables**: add `VITE_SUPABASE_URL` (`https://<ref>.supabase.co`) and `VITE_SUPABASE_ANON_KEY` from the hosted project (Project Settings → API). The workflow refuses to build without them. Add `VITE_VAPID_PUBLIC_KEY` too for notifications (see [Notifications](#notifications)).
3. In the hosted Supabase project, **Authentication → URL Configuration**: set the Site URL to `https://avinashsaripilli24.github.io/super_app/`.

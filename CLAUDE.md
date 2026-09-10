# super_app — conventions

Mobile-first installable PWA with a Supabase backend. Modules live under `src/modules/<name>`.

## Adding a module

1. Create `src/modules/<name>/` with `<name>-page.tsx` (+ `api.ts`, `schemas.ts`, `components/` as needed).
2. Add one entry to [src/modules/registry.ts](src/modules/registry.ts). This drives the bottom nav, the sidebar, the dashboard tiles and role visibility. `inNav` covers the sidebar and the phone tab bar; **the tab bar holds four tabs at most**, so anything beyond the everyday four gets `inTabBar: false` (it stays in the sidebar, the dashboard tiles and — on phones — the account menu, like User Management).
3. Wire its routes in [src/router.tsx](src/router.tsx) under `authedRoute` (or `adminRoute` for admin-only pages).
4. Add tables + RLS in a new `supabase/migrations/<timestamp>_<name>.sql`, then `npm run db:reset` and `npm run db:types`.

## Backend rules

- Supabase is the only backend. Talk to it through the singleton in [src/lib/supabase.ts](src/lib/supabase.ts).
- Every table has RLS enabled. Use `(select auth.uid())` in policies and `public.is_admin()` for admin checks. Never select from `profiles` inside a `profiles` policy (infinite recursion).
- Privileged actions (creating users, changing roles, banning) go through the `admin-users` edge function with the service role. The frontend never holds the service key.
- Migrations are schema only. Dev data (including the default admin) lives in `supabase/seed.sql`.
- Keep `profiles.role` as the source of truth; `app_metadata.role` is written on create for forward compatibility only.

## Frontend rules

- **Forms**: `react-hook-form` + `zod` via `@hookform/resolvers/zod`, rendered with the `Field` helper. No hand-rolled `useState` forms.
- **Lists/tables**: no Prev/Next pagination. Long lists page server-side with `useInfiniteList` ([src/hooks/use-infinite-list.ts](src/hooks/use-infinite-list.ts)): 25 rows per `.range()` page, filters pushed into the query (`.eq` / `.or` / `.ilike` via `likePattern` in `src/lib/postgrest.ts`), always a final `.order('id')` tiebreaker, `ListSkeleton` while the first page loads and `LoadMoreSentinel` under the list (see the transaction list and [src/modules/users/users-page.tsx](src/modules/users/users-page.tsx)). `@tanstack/react-table` is used for column definitions only. Totals and breakdowns come from the `ledger_summary` RPC, never from the rows that happen to be loaded.
- **Loading**: every screen waiting on a request renders `Skeleton` placeholders shaped like the real content. No spinners, no blank screens.
- **Dates**: use `DatePicker` / `DateRangePicker` from `src/components/ui/date-picker.tsx` (react-day-picker v9 + Popover), never a bare `<input type="date">`. Values are `YYYY-MM-DD` strings built with date-fns `format`, never `toISOString()` (timezone shift).
- **Money**: figures come from `formatMoney` (`src/lib/utils.ts`). Every money *input* shows the amount in words below it (Indian convention — thousand/lakh/crore, "Rupees … Only") by passing `amountInWords(watch('amount'))` from `src/lib/money-words.ts` into `Field`'s `hint`. Every money *total* is wrapped in `MoneyWords` (`src/components/ui/money.tsx`), which renders the figure as a popover trigger revealing the same words — so it cannot be nested inside another button; rows that are already tappable open a sheet where the words show instead.
- **Errors**: surface with `toast.error(errorMessage(err))` from sonner.
- **Mobile**: design for a 360px-wide phone. Bottom sheets (`Sheet side="bottom"`) for forms, 16px inputs (iOS zoom), safe-area padding via `.pt-safe` / `.pb-safe`, touch targets ≥ 40px, and `pb-16 md:pb-0` on any page with the floating + button. Names the user chose or that come from a category/type (which can be as long as "Post Office Schemes (NSC/KVP/SSY/SCSS)") wrap with `break-words` — never `truncate`; money figures opposite them get `shrink-0 whitespace-nowrap`. Pickers are one-per-row lists, not small tiles, so the full name is readable. Inside a form, a long picker (categories, asset types) is a compact trigger row that opens the list in its own stacked bottom sheet — `CategoryPicker` (`src/modules/expenses/components/category-picker.tsx`) — so the form's later fields stay reachable. Money tiles run two across on a phone (`grid-cols-2 sm:grid-cols-3`); `StatTile` steps its own font down for lakh/crore figures.
- **Keyboard**: the on-screen keyboard resizes the layout (`interactive-widget=resizes-content` in `index.html`), so bottom sheets sit on it with their `SheetFooter` pinned. `src/lib/keyboard.ts` handles, globally, Enter → next field (submit from the last), the `enterKeyHint` label and scrolling the focused field into view — don't add per-form focus code; a search box that owns Enter must `preventDefault`. Floating or bottom-fixed UI gets `keyboard-open:hidden`. Give text inputs the right keyboard: `type="number" inputMode="decimal"` for amounts, `type="search"` for filters, `autoCapitalize="words"` for names (`Input` already defaults search/email/password to no autocorrect).
- **Theme**: tokens in `src/index.css`; dark mode is the `.dark` class on `<html>`. Keep `color-scheme` pinned per theme.
- Path alias `@/` → `src/`.

## Expense Tracker is a mock (shared ledger)

The data model in `supabase/migrations/*_expense_tracker.sql` + `*_shared_ledger.sql` and `src/modules/expenses/` is a placeholder **shared ledger**: every signed-in user reads every transaction/category/budget; inserts are own-only; updates/deletes are creator-or-admin (RLS). `user_id` is the creator and is shown as "Added by". Income rows also carry `earned_by` (the household member who earned it, shown as "Earned by"; a trigger defaults it to the creator and nulls it for expenses). The list's single Person filter matches `user_id` or `earned_by`. The only cross-user profile surface is the `public.user_names` view (id, full_name, email); never widen `profiles` RLS for this. Mirror the permission rule in the UI with `canEdit()` from `src/modules/expenses/api.ts`.

Categories are global defaults (`user_id null`, seeded in the migrations, including the `Other` / `Other Income` fallbacks) plus shared custom ones. There are ~30, so both the Categories page and the transaction sheet's picker filter by name; the picker also creates the searched-for category inline (`Add “…” as a new expense category`, or Enter) and offers the `Other` fallback when nothing matches. Inline creation calls `onCategoriesChanged` so the page refetches.

Excel export lives in `src/modules/expenses/export.ts` (exceljs, dynamically imported). Chart colours are the validated tokens `--chart-spent` / `--chart-income` in `src/index.css`; charts are inline SVG (see `components/monthly-bars.tsx`), no chart library.

Replace the model when real requirements arrive; keep the module folder + registry entry pattern.

## Assets & Debts (net-worth tracker)

`supabase/migrations/*_assets.sql` + `src/modules/assets/`. Same shared-household rules as the ledger (read all / insert own / creator-or-admin edit-delete, `user_id` = "Added by"); `holdings.holder_id` is the household member who holds it ("Holder", an app user, defaults to the creator, names from `user_names`). Types (`asset_categories`) are global defaults with fixed ids `b0000000-…` plus shared custom ones; each type has a `valuation_mode` (`units` = units held × latest price, `value` = latest recorded value ± later flows) and, for assets, an `asset_class`. Debts are always value-mode.

**Never compute a holding's value in TypeScript.** `public.holding_value_at()` is the single implementation of the value rule; the `holding_current` view (`security_invoker`, so RLS applies) exposes it per holding for lists, and `assets_overview` / `assets_activity` / `networth_history` aggregate it. Lists page `holding_current` / `holding_transactions` with `useInfiniteList`; totals come from the RPCs. Units-mode valuations must carry `unit_price` (the rule reads the latest known price, from a valuation or a buy). Closing a holding sets `closed_on` and zeroes its current value (gain becomes realised). Targets are one standing amount per asset type (`asset_targets`, find-then-update-or-insert like budgets). XIRR is client-side (`xirr.ts`) from the holding's flows plus current value; `n/a` when it cannot be meaningful. Never send `user_id` in `update`/`upsert` payloads (`keep_row_owner`); valuations upsert on `(holding_id, as_of)`, and a same-day row by someone else is locked for non-admins. Chart tokens `--chart-assets` / `--chart-debts`; export in `export.ts` (exceljs).

## App & Assets lock

Two checkpoints share one credential: a PIN (PBKDF2 via Web Crypto, 5 attempts then the account password) plus an optional WebAuthn platform credential (fingerprint / Face ID), stored per user **on this device only** in localStorage (`src/lib/app-lock.ts`). It is a privacy gate, not access control — RLS is unchanged. Unlock state lives in `useAppLock` (`src/store/app-lock-store.ts`, in memory, so a reload locks; sign-out locks both). Required for everyone; needs a secure context (https/localhost), and WebAuthn also refuses IP-address hosts. Settings has the "App lock" card.

- **App lock**: `AppLockOverlay` (mounted in `App.tsx` while signed in) is a full-screen Radix dialog shown on launch and the moment the page is hidden (`visibilitychange`, no grace; skipped while `biometricPending()`). The app stays mounted underneath, so one unlock returns you where you were. It also owns first-time PIN setup. Signing in with the password unlocks it (`login.tsx`).
- **Assets lock**: every `/assets` route is a child of the pathless `assetsLockRoute` (`id: '_assetsLock'`, `AssetsLockGate`), so route ids are `/_authed/_assetsLock/assets…`; new Assets routes go under it too. It renders `<Outlet />` only once unlocked (nothing mounts or fetches before) and re-locks when it unmounts (leaving Assets). Asset figures never appear outside Assets: the dashboard's Net worth card is masked and does not call `assets_overview`.
- **Dev**: `locksEnabled` is false on the Vite dev server (`import.meta.env.DEV`) unless `VITE_APP_LOCK=on`; then neither lock renders and the dashboard shows the real net worth. Production builds always lock.

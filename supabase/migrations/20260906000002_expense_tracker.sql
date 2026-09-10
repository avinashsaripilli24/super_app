-- ---------------------------------------------------------------------------
-- Expense Tracker (MOCK DATA MODEL)
--
-- Personal spending tracker: every user sees only their own rows. There is no
-- approval workflow and admins do not read other users' transactions.
-- Replace / extend this when the real expense requirements arrive.
-- ---------------------------------------------------------------------------

create type public.txn_kind as enum ('expense', 'income');

-- Categories: user_id NULL = global default available to everyone.
create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  name        text not null,
  icon        text not null default 'tag',
  color       text not null default '#64748b',
  kind        public.txn_kind not null default 'expense',
  sort_order  int not null default 100,
  created_at  timestamptz not null default now()
);

create index expense_categories_user_idx on public.expense_categories (user_id, kind, sort_order);

create table public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id     uuid references public.expense_categories (id) on delete set null,
  kind            public.txn_kind not null default 'expense',
  amount          numeric(12, 2) not null check (amount > 0),
  currency        char(3) not null default 'INR',
  occurred_on     date not null default current_date,
  note            text,
  payment_method  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index transactions_user_date_idx on public.transactions (user_id, occurred_on desc);

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- Monthly budgets: category_id NULL = overall monthly limit.
create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id  uuid references public.expense_categories (id) on delete cascade,
  month        date not null check (month = date_trunc('month', month)::date),
  amount       numeric(12, 2) not null check (amount >= 0),
  created_at   timestamptz not null default now()
);

-- Unique per user+category+month; NULL category handled via coalesce.
create unique index budgets_unique_idx
  on public.budgets (user_id, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid), month);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.expense_categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

create policy "categories: read defaults"
  on public.expense_categories for select
  to authenticated
  using (user_id is null);

create policy "categories: owner all"
  on public.expense_categories for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "transactions: owner all"
  on public.transactions for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "budgets: owner all"
  on public.budgets for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.expense_categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;

-- ---------------------------------------------------------------------------
-- Default categories (global, fixed ids so the seed can reference them)
-- ---------------------------------------------------------------------------

insert into public.expense_categories (id, user_id, name, icon, color, kind, sort_order) values
  ('a0000000-0000-4000-8000-000000000001', null, 'Food & Dining', 'utensils',      '#f97316', 'expense', 10),
  ('a0000000-0000-4000-8000-000000000002', null, 'Transport',     'car',           '#3b82f6', 'expense', 20),
  ('a0000000-0000-4000-8000-000000000003', null, 'Shopping',      'shopping-bag',  '#ec4899', 'expense', 30),
  ('a0000000-0000-4000-8000-000000000004', null, 'Bills',         'receipt',       '#eab308', 'expense', 40),
  ('a0000000-0000-4000-8000-000000000005', null, 'Health',        'heart-pulse',   '#ef4444', 'expense', 50),
  ('a0000000-0000-4000-8000-000000000006', null, 'Entertainment', 'clapperboard',  '#8b5cf6', 'expense', 60),
  ('a0000000-0000-4000-8000-000000000007', null, 'Other',         'tag',           '#64748b', 'expense', 90),
  ('a0000000-0000-4000-8000-000000000011', null, 'Salary',        'briefcase',     '#22c55e', 'income',  10),
  ('a0000000-0000-4000-8000-000000000012', null, 'Other Income',  'coins',         '#10b981', 'income',  90);

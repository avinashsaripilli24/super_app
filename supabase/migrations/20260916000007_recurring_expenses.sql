-- ---------------------------------------------------------------------------
-- Recurring expenses: templates set up once and added to a month in bulk by
-- hand (nothing is inserted automatically). Shared like the ledger: everyone
-- reads, insert own, creator-or-admin edit/delete.
-- ---------------------------------------------------------------------------

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Set null when the category is deleted; the item must get a new one before it can be added again.
  category_id uuid references public.expense_categories (id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  -- Capped at 27 so the day exists in every month.
  day_of_month smallint not null check (day_of_month between 1 and 27),
  note text,
  payment_method text not null default 'upi',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.recurring_expenses.user_id is 'Creator of the row; shown as "Added by".';

create index recurring_expenses_day_idx on public.recurring_expenses (day_of_month);

create trigger recurring_expenses_set_updated_at
  before update on public.recurring_expenses
  for each row execute function public.set_updated_at();

create trigger recurring_expenses_keep_owner
  before update on public.recurring_expenses
  for each row execute function public.keep_row_owner();

alter table public.recurring_expenses enable row level security;

create policy "recurring_expenses: read all"
  on public.recurring_expenses for select
  to authenticated
  using (true);

create policy "recurring_expenses: insert own"
  on public.recurring_expenses for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "recurring_expenses: update own or admin"
  on public.recurring_expenses for update
  to authenticated
  using ((select auth.uid()) = user_id or public.is_admin())
  with check ((select auth.uid()) = user_id or public.is_admin());

create policy "recurring_expenses: delete own or admin"
  on public.recurring_expenses for delete
  to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

grant select, insert, update, delete on public.recurring_expenses to authenticated;

-- Which template a transaction was added from; only used to hint "already added this month".
alter table public.transactions
  add column recurring_id uuid references public.recurring_expenses (id) on delete set null;

create index transactions_recurring_idx on public.transactions (recurring_id, occurred_on)
  where recurring_id is not null;

-- ---------------------------------------------------------------------------
-- Ledger paging + "Earned by" + richer default categories.
--
-- * transactions.earned_by: household member who earned an income row (shown
--   as "Earned by"). Distinct from user_id (creator, "Added by"). Expenses keep
--   it null; a trigger defaults it to the creator for income.
-- * Indexes for server-side paging (occurred_on desc, created_at desc, id desc)
--   and the new person / category filters.
-- * More default categories (Charity, Gifts, Business, Freelance, ...).
-- * ledger_summary(start, end): one aggregate call for totals, breakdowns,
--   per-person and per-month figures, so screens never sum loaded pages.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- earned_by
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column earned_by uuid references auth.users (id) on delete set null;

comment on column public.transactions.earned_by is
  'Income only: household member who earned it (shown as "Earned by"). Null for expenses. Distinct from user_id (creator, "Added by").';

-- Expenses never carry an earner. Income requiredness is enforced by the
-- trigger below (defaults to the creator) rather than a two-way CHECK so that
-- `on delete set null` can never fail.
alter table public.transactions
  add constraint transactions_earned_by_income_only
  check (kind = 'income' or earned_by is null);

create or replace function public.transactions_default_earned_by()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'income' then
    if new.earned_by is null then
      new.earned_by := new.user_id;
    end if;
  else
    new.earned_by := null;
  end if;
  return new;
end;
$$;

create trigger transactions_default_earned_by
  before insert or update on public.transactions
  for each row execute function public.transactions_default_earned_by();

-- Backfill existing income rows (no-op on a fresh reset).
update public.transactions
set earned_by = user_id
where kind = 'income' and earned_by is null;

-- Paging order for the shared list (unfiltered month ranges) + filter columns.
create index transactions_occurred_idx
  on public.transactions (occurred_on desc, created_at desc, id desc);
create index transactions_earned_by_idx
  on public.transactions (earned_by) where earned_by is not null;
create index transactions_category_idx
  on public.transactions (category_id);

-- ---------------------------------------------------------------------------
-- More default categories (user_id null = global default). Fixed ids continue
-- the pattern from the expense_tracker migration so seeds can reference them.
-- ---------------------------------------------------------------------------

insert into public.expense_categories (id, user_id, name, icon, color, kind, sort_order) values
  -- expense
  ('a0000000-0000-4000-8000-000000000021', null, 'Groceries',      'shopping-cart',  '#84cc16', 'expense', 12),
  ('a0000000-0000-4000-8000-000000000022', null, 'Rent & Housing', 'building-2',     '#0ea5e9', 'expense', 22),
  ('a0000000-0000-4000-8000-000000000023', null, 'Fuel',           'fuel',           '#f59e0b', 'expense', 25),
  ('a0000000-0000-4000-8000-000000000024', null, 'Education',      'graduation-cap', '#6366f1', 'expense', 45),
  ('a0000000-0000-4000-8000-000000000025', null, 'Travel',         'plane',          '#14b8a6', 'expense', 55),
  ('a0000000-0000-4000-8000-000000000026', null, 'Personal Care',  'scissors',       '#f43f5e', 'expense', 62),
  ('a0000000-0000-4000-8000-000000000027', null, 'Subscriptions',  'repeat',         '#a855f7', 'expense', 64),
  ('a0000000-0000-4000-8000-000000000028', null, 'Insurance',      'shield',         '#0891b2', 'expense', 66),
  ('a0000000-0000-4000-8000-000000000029', null, 'EMI & Loans',    'landmark',       '#b45309', 'expense', 68),
  ('a0000000-0000-4000-8000-000000000030', null, 'Investments',    'trending-up',    '#16a34a', 'expense', 70),
  ('a0000000-0000-4000-8000-000000000031', null, 'Family & Kids',  'baby',           '#fb7185', 'expense', 72),
  ('a0000000-0000-4000-8000-000000000032', null, 'Pets',           'paw-print',      '#d97706', 'expense', 74),
  ('a0000000-0000-4000-8000-000000000033', null, 'Charity',        'hand-heart',     '#e11d48', 'expense', 76),
  ('a0000000-0000-4000-8000-000000000034', null, 'Gifts',          'gift',           '#db2777', 'expense', 78),
  -- income
  ('a0000000-0000-4000-8000-000000000041', null, 'Business',             'store',      '#0d9488', 'income', 20),
  ('a0000000-0000-4000-8000-000000000042', null, 'Freelance',            'laptop',     '#2563eb', 'income', 30),
  ('a0000000-0000-4000-8000-000000000043', null, 'Rental',               'building-2', '#0ea5e9', 'income', 40),
  ('a0000000-0000-4000-8000-000000000044', null, 'Interest & Dividends', 'percent',    '#7c3aed', 'income', 50),
  ('a0000000-0000-4000-8000-000000000045', null, 'Bonus',                'sparkles',   '#f59e0b', 'income', 60),
  ('a0000000-0000-4000-8000-000000000046', null, 'Refunds',              'rotate-ccw', '#64748b', 'income', 70),
  ('a0000000-0000-4000-8000-000000000047', null, 'Gifts received',       'hand-coins', '#db2777', 'income', 80)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- ledger_summary: aggregates for start <= occurred_on <= end.
-- Runs as the caller (RLS: read-all), so it sees the same rows the list does.
-- ---------------------------------------------------------------------------

create or replace function public.ledger_summary(p_start date, p_end date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with t as (
    select kind, amount, category_id, user_id, earned_by, occurred_on
    from public.transactions
    where occurred_on between p_start and p_end
  )
  select jsonb_build_object(
    'spent',  coalesce((select sum(amount) from t where kind = 'expense'), 0),
    'income', coalesce((select sum(amount) from t where kind = 'income'), 0),
    'by_category', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id',    coalesce(x.category_id::text, 'uncategorised'),
                 'name',  coalesce(c.name, 'Uncategorised'),
                 'icon',  coalesce(c.icon, 'tag'),
                 'color', coalesce(c.color, '#94a3b8'),
                 'kind',  x.kind,
                 'total', x.total,
                 'count', x.count)
               order by x.total desc)
      from (
        select kind, category_id, sum(amount) as total, count(*) as count
        from t
        group by kind, category_id
      ) x
      left join public.expense_categories c on c.id = x.category_id
    ), '[]'::jsonb),
    'added_by', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.user_id, 'spent', p.spent, 'income', p.income, 'count', p.count))
      from (
        -- count = expense rows only; income rows are counted under earned_by
        -- so each row is credited to exactly one person.
        select user_id,
               coalesce(sum(amount) filter (where kind = 'expense'), 0) as spent,
               coalesce(sum(amount) filter (where kind = 'income'), 0)  as income,
               count(*) filter (where kind = 'expense') as count
        from t
        group by user_id
      ) p
    ), '[]'::jsonb),
    'earned_by', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.person, 'income', p.income, 'count', p.count))
      from (
        select coalesce(earned_by, user_id) as person, sum(amount) as income, count(*) as count
        from t
        where kind = 'income'
        group by 1
      ) p
    ), '[]'::jsonb),
    'by_month', coalesce((
      select jsonb_agg(
               jsonb_build_object('month', to_char(q.m, 'YYYY-MM'), 'spent', q.spent, 'income', q.income)
               order by q.m)
      from (
        select date_trunc('month', occurred_on)::date as m,
               coalesce(sum(amount) filter (where kind = 'expense'), 0) as spent,
               coalesce(sum(amount) filter (where kind = 'income'), 0)  as income
        from t
        group by 1
      ) q
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.ledger_summary(date, date) from public, anon;
grant execute on function public.ledger_summary(date, date) to authenticated;

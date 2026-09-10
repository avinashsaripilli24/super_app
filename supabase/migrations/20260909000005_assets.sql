-- ---------------------------------------------------------------------------
-- Assets & debts (net-worth tracker). Shared household model, same rules as
-- the expense ledger: everyone reads everything, inserts are own-only,
-- updates/deletes are creator-or-admin. user_id = creator ("Added by");
-- holdings.holder_id = household member who holds it ("Holder").
--
-- The value rule lives in holding_value_at() (single source of truth); the
-- holding_current view exposes it per holding (RLS via security_invoker) and
-- assets_overview / assets_activity / networth_history aggregate it.
-- ---------------------------------------------------------------------------

create type public.asset_kind       as enum ('asset', 'debt');
create type public.valuation_mode   as enum ('units', 'value');
create type public.asset_class      as enum ('equity', 'debt', 'cash', 'gold', 'real_estate', 'other');
create type public.holding_status   as enum ('active', 'closed');
create type public.holding_txn_type as enum ('invest', 'redeem', 'income', 'bonus', 'borrow', 'repay', 'charge');

-- ---------------------------------------------------------------------------
-- asset_categories ("types"). user_id null = global default.
-- ---------------------------------------------------------------------------

create table public.asset_categories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete cascade,
  kind            public.asset_kind not null default 'asset',
  name            text not null,
  icon            text not null default 'tag',
  color           text not null default '#64748b',
  sort_order      int not null default 100,
  valuation_mode  public.valuation_mode not null default 'value',
  asset_class     public.asset_class,
  created_at      timestamptz not null default now()
);

comment on column public.asset_categories.valuation_mode is
  'units: value = units held x latest price (stocks, funds, gold). value: latest recorded value +/- later flows (deposits, property, loans).';
comment on column public.asset_categories.asset_class is 'Assets only; the trigger nulls it for debts.';

create index asset_categories_kind_idx on public.asset_categories (kind, sort_order, name);

-- Debts are always value-mode with no asset class; assets always have a class.
create or replace function public.asset_categories_normalise()
returns trigger
language plpgsql
as $$
begin
  if new.kind = 'debt' then
    new.valuation_mode := 'value';
    new.asset_class := null;
  elsif new.asset_class is null then
    new.asset_class := 'other';
  end if;
  return new;
end;
$$;

create trigger asset_categories_normalise
  before insert or update on public.asset_categories
  for each row execute function public.asset_categories_normalise();

-- ---------------------------------------------------------------------------
-- holdings
-- ---------------------------------------------------------------------------

create table public.holdings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id    uuid not null references public.asset_categories (id) on delete restrict,
  holder_id      uuid references auth.users (id) on delete set null,
  name           text not null,
  institution    text,
  identifier     text,
  status         public.holding_status not null default 'active',
  opened_on      date,
  maturity_on    date,
  closed_on      date,
  interest_rate  numeric(6, 3) check (interest_rate is null or interest_rate between 0 and 100),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint holdings_closed_on_matches_status check ((status = 'closed') = (closed_on is not null))
);

comment on column public.holdings.user_id   is 'Creator of the row; shown as "Added by".';
comment on column public.holdings.holder_id is 'Household member who holds it ("Holder"). Defaults to the creator on insert.';

create index holdings_category_idx on public.holdings (category_id);
create index holdings_holder_idx   on public.holdings (holder_id);
create index holdings_status_idx   on public.holdings (status);
create index holdings_maturity_idx on public.holdings (maturity_on) where maturity_on is not null;

create trigger holdings_set_updated_at
  before update on public.holdings
  for each row execute function public.set_updated_at();

create trigger holdings_keep_owner
  before update on public.holdings
  for each row execute function public.keep_row_owner();

-- Default holder = creator (insert only: an update-time default could re-point
-- at a user being deleted via `on delete set null`); closed_on follows status;
-- a holding never moves between an asset type and a debt type.
create or replace function public.holdings_maintain()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' and new.holder_id is null then
    new.holder_id := new.user_id;
  end if;

  if new.status = 'closed' then
    new.closed_on := coalesce(new.closed_on, current_date);
  else
    new.closed_on := null;
  end if;

  if tg_op = 'UPDATE' and new.category_id <> old.category_id then
    if (select kind from public.asset_categories where id = new.category_id)
       is distinct from
       (select kind from public.asset_categories where id = old.category_id) then
      raise exception 'A holding cannot move between asset and debt types';
    end if;
  end if;
  return new;
end;
$$;

create trigger holdings_maintain
  before insert or update on public.holdings
  for each row execute function public.holdings_maintain();

-- ---------------------------------------------------------------------------
-- holding_transactions (cash flows)
-- ---------------------------------------------------------------------------

create table public.holding_transactions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  holding_id       uuid not null references public.holdings (id) on delete cascade,
  occurred_on      date not null default current_date,
  type             public.holding_txn_type not null,
  amount           numeric(14, 2) not null default 0 check (amount >= 0),
  quantity         numeric(18, 6) check (quantity is null or quantity > 0),
  unit_price       numeric(14, 4) check (unit_price is null or unit_price > 0),
  interest_amount  numeric(14, 2),
  note             text,
  created_at       timestamptz not null default now(),
  -- bonus units carry no cash; everything else must have an amount
  constraint holding_transactions_amount_by_type check (type = 'bonus' or amount > 0),
  constraint holding_transactions_bonus_has_qty  check (type <> 'bonus' or quantity is not null),
  -- interest split only on repayments, never more than the repayment
  constraint holding_transactions_interest_repay_only check (
    interest_amount is null
    or (type = 'repay' and interest_amount >= 0 and interest_amount <= amount)
  )
);

comment on column public.holding_transactions.interest_amount is
  'Repay only: portion of amount that was interest; the remainder reduces the outstanding principal.';

create index holding_transactions_holding_idx
  on public.holding_transactions (holding_id, occurred_on desc, created_at desc, id desc);
create index holding_transactions_occurred_idx
  on public.holding_transactions (occurred_on desc, created_at desc, id desc);

create trigger holding_transactions_keep_owner
  before update on public.holding_transactions
  for each row execute function public.keep_row_owner();

create or replace function public.holding_transactions_check_type()
returns trigger
language plpgsql
as $$
declare
  v_kind public.asset_kind;
begin
  select c.kind into v_kind
  from public.holdings h
  join public.asset_categories c on c.id = h.category_id
  where h.id = new.holding_id;

  if v_kind is null then
    raise exception 'Unknown holding';
  end if;
  if v_kind = 'asset' and new.type not in ('invest', 'redeem', 'income', 'bonus') then
    raise exception '% is not a valid transaction for an asset', new.type;
  end if;
  if v_kind = 'debt' and new.type not in ('borrow', 'repay', 'charge') then
    raise exception '% is not a valid transaction for a debt', new.type;
  end if;
  if new.type <> 'repay' then
    new.interest_amount := null;
  end if;
  return new;
end;
$$;

create trigger holding_transactions_check_type
  before insert or update on public.holding_transactions
  for each row execute function public.holding_transactions_check_type();

-- ---------------------------------------------------------------------------
-- holding_valuations (mark-to-market points)
-- ---------------------------------------------------------------------------

create table public.holding_valuations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  holding_id  uuid not null references public.holdings (id) on delete cascade,
  as_of       date not null default current_date,
  value       numeric(14, 2) not null check (value >= 0),
  unit_price  numeric(14, 4) check (unit_price is null or unit_price > 0),
  note        text,
  created_at  timestamptz not null default now(),
  unique (holding_id, as_of)
);

comment on column public.holding_valuations.unit_price is
  'Units-mode holdings: NAV / price on as_of. value is then units held x price at the time of entry.';

create trigger holding_valuations_keep_owner
  before update on public.holding_valuations
  for each row execute function public.keep_row_owner();

-- ---------------------------------------------------------------------------
-- asset_targets: one standing amount per type (household).
-- ---------------------------------------------------------------------------

create table public.asset_targets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id  uuid not null unique references public.asset_categories (id) on delete cascade,
  amount       numeric(14, 2) not null check (amount >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger asset_targets_set_updated_at
  before update on public.asset_targets
  for each row execute function public.set_updated_at();

create trigger asset_targets_keep_owner
  before update on public.asset_targets
  for each row execute function public.keep_row_owner();

-- ---------------------------------------------------------------------------
-- RLS (shared-ledger style)
-- ---------------------------------------------------------------------------

alter table public.asset_categories     enable row level security;
alter table public.holdings             enable row level security;
alter table public.holding_transactions enable row level security;
alter table public.holding_valuations   enable row level security;
alter table public.asset_targets        enable row level security;

-- asset_categories: defaults (user_id null) are read-only for everyone.
create policy "asset_categories: read all"
  on public.asset_categories for select to authenticated using (true);
create policy "asset_categories: insert own"
  on public.asset_categories for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "asset_categories: update own or admin"
  on public.asset_categories for update to authenticated
  using (user_id is not null and ((select auth.uid()) = user_id or public.is_admin()))
  with check (user_id is not null and ((select auth.uid()) = user_id or public.is_admin()));
create policy "asset_categories: delete own or admin"
  on public.asset_categories for delete to authenticated
  using (user_id is not null and ((select auth.uid()) = user_id or public.is_admin()));

-- holdings
create policy "holdings: read all"
  on public.holdings for select to authenticated using (true);
create policy "holdings: insert own"
  on public.holdings for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "holdings: update own or admin"
  on public.holdings for update to authenticated
  using ((select auth.uid()) = user_id or public.is_admin())
  with check ((select auth.uid()) = user_id or public.is_admin());
create policy "holdings: delete own or admin"
  on public.holdings for delete to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

-- holding_transactions
create policy "holding_transactions: read all"
  on public.holding_transactions for select to authenticated using (true);
create policy "holding_transactions: insert own"
  on public.holding_transactions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "holding_transactions: update own or admin"
  on public.holding_transactions for update to authenticated
  using ((select auth.uid()) = user_id or public.is_admin())
  with check ((select auth.uid()) = user_id or public.is_admin());
create policy "holding_transactions: delete own or admin"
  on public.holding_transactions for delete to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

-- holding_valuations
create policy "holding_valuations: read all"
  on public.holding_valuations for select to authenticated using (true);
create policy "holding_valuations: insert own"
  on public.holding_valuations for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "holding_valuations: update own or admin"
  on public.holding_valuations for update to authenticated
  using ((select auth.uid()) = user_id or public.is_admin())
  with check ((select auth.uid()) = user_id or public.is_admin());
create policy "holding_valuations: delete own or admin"
  on public.holding_valuations for delete to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

-- asset_targets
create policy "asset_targets: read all"
  on public.asset_targets for select to authenticated using (true);
create policy "asset_targets: insert own"
  on public.asset_targets for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "asset_targets: update own or admin"
  on public.asset_targets for update to authenticated
  using ((select auth.uid()) = user_id or public.is_admin())
  with check ((select auth.uid()) = user_id or public.is_admin());
create policy "asset_targets: delete own or admin"
  on public.asset_targets for delete to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

grant select, insert, update, delete on public.asset_categories     to authenticated;
grant select, insert, update, delete on public.holdings             to authenticated;
grant select, insert, update, delete on public.holding_transactions to authenticated;
grant select, insert, update, delete on public.holding_valuations   to authenticated;
grant select, insert, update, delete on public.asset_targets        to authenticated;

-- ---------------------------------------------------------------------------
-- holding_value_at: the value rule as of a date. Used by holding_current
-- (date 'infinity' = everything recorded) and networth_history (each month
-- end). Always returns one row.
--   units mode : units_held x latest known price (valuation or txn price),
--                falling back to the value rule if no price exists
--   value mode : latest valuation on/before p_on + invest - redeem dated after
--                it; no valuation -> sum(invest) - sum(redeem)
--   debt       : latest valuation (outstanding) + borrow/charge - principal
--                part of repayments after it; no valuation -> over every row
--   Never negative.
-- ---------------------------------------------------------------------------

create or replace function public.holding_value_at(
  p_holding uuid,
  p_kind    public.asset_kind,
  p_mode    public.valuation_mode,
  p_on      date
)
returns table (
  current_value   numeric,
  units_held      numeric,
  unit_price      numeric,
  last_valued_on  date
)
language sql
stable
security invoker
set search_path = public
as $$
  with v as (
    select as_of, value, unit_price
    from public.holding_valuations
    where holding_id = p_holding and as_of <= p_on
    order by as_of desc, created_at desc
    limit 1
  ),
  px as (
    select p.unit_price
    from (
      select as_of as on_date, created_at, unit_price
      from public.holding_valuations
      where holding_id = p_holding and as_of <= p_on and unit_price is not null
      union all
      select occurred_on, created_at, unit_price
      from public.holding_transactions
      where holding_id = p_holding and occurred_on <= p_on and unit_price is not null
    ) p
    order by p.on_date desc, p.created_at desc
    limit 1
  ),
  tx as (
    select
      coalesce(sum(t.amount) filter (where t.type = 'invest'), 0)                                   as invested,
      coalesce(sum(t.amount) filter (where t.type = 'redeem'), 0)                                   as redeemed,
      coalesce(sum(t.amount) filter (where t.type in ('borrow', 'charge')), 0)                      as borrowed,
      coalesce(sum(t.amount - coalesce(t.interest_amount, 0)) filter (where t.type = 'repay'), 0)   as principal_repaid,
      coalesce(sum(t.quantity) filter (where t.type in ('invest', 'bonus')), 0)
        - coalesce(sum(t.quantity) filter (where t.type = 'redeem'), 0)                             as units,
      coalesce(sum(t.amount) filter (where t.type = 'invest' and t.occurred_on > v.as_of), 0)       as invested_after,
      coalesce(sum(t.amount) filter (where t.type = 'redeem' and t.occurred_on > v.as_of), 0)       as redeemed_after,
      coalesce(sum(t.amount) filter (where t.type in ('borrow', 'charge') and t.occurred_on > v.as_of), 0)
                                                                                                    as borrowed_after,
      coalesce(sum(t.amount - coalesce(t.interest_amount, 0))
               filter (where t.type = 'repay' and t.occurred_on > v.as_of), 0)                      as principal_repaid_after
    from public.holding_transactions t
    left join v on true
    where t.holding_id = p_holding and t.occurred_on <= p_on
  )
  select
    greatest(0, case
      when p_kind = 'debt' then
        case when v.as_of is not null
             then v.value + tx.borrowed_after - tx.principal_repaid_after
             else tx.borrowed - tx.principal_repaid
        end
      when p_mode = 'units' and px.unit_price is not null then
        greatest(0, tx.units) * px.unit_price
      when v.as_of is not null then
        v.value + tx.invested_after - tx.redeemed_after
      else
        tx.invested - tx.redeemed
    end)::numeric(14, 2)      as current_value,
    tx.units::numeric(18, 6)  as units_held,
    px.unit_price,
    v.as_of                   as last_valued_on
  from tx
  left join v  on true
  left join px on true;
$$;

revoke execute on function public.holding_value_at(uuid, public.asset_kind, public.valuation_mode, date) from public, anon;
grant  execute on function public.holding_value_at(uuid, public.asset_kind, public.valuation_mode, date) to authenticated;

-- ---------------------------------------------------------------------------
-- holding_current: one row per holding with its current figures. "Current"
-- means everything recorded, so the value rule runs as of date 'infinity':
-- the server's current_date is UTC and would drop rows a user in a timezone
-- ahead of it dated "today". security_invoker (PG 15+) so the caller's RLS
-- applies; PostgREST can select/filter/range it.
-- ---------------------------------------------------------------------------

create view public.holding_current
with (security_invoker = true)
as
select
  h.id, h.user_id, h.holder_id, h.category_id, h.name, h.institution, h.identifier, h.status,
  h.opened_on, h.maturity_on, h.closed_on, h.interest_rate, h.notes, h.created_at, h.updated_at,
  c.kind, c.valuation_mode, c.asset_class,
  c.name  as category_name,
  c.icon  as category_icon,
  c.color as category_color,
  case when h.status = 'closed' then 0 else s.current_value end            as current_value,
  s.units_held,
  s.unit_price,
  s.last_valued_on,
  case when c.kind = 'asset' then coalesce(tx.invested, 0)
       else coalesce(tx.borrowed, 0) end                                    as invested,
  case when c.kind = 'asset' then coalesce(tx.redeemed, 0) + coalesce(tx.income, 0)
       else coalesce(tx.repaid, 0) end                                      as withdrawn,
  coalesce(tx.income, 0)                                                    as income,
  coalesce(tx.interest_paid, 0)                                             as interest_paid,
  case when c.kind = 'asset'
       then (case when h.status = 'closed' then 0 else s.current_value end)
            + coalesce(tx.redeemed, 0) + coalesce(tx.income, 0) - coalesce(tx.invested, 0)
  end                                                                       as gain,
  tx.last_txn_on,
  coalesce(tx.txn_count, 0)                                                 as txn_count
from public.holdings h
join public.asset_categories c on c.id = h.category_id
left join lateral public.holding_value_at(h.id, c.kind, c.valuation_mode, date 'infinity') s on true
left join (
  select holding_id,
         sum(amount) filter (where type = 'invest') as invested,
         sum(amount) filter (where type = 'redeem') as redeemed,
         sum(amount) filter (where type = 'income') as income,
         sum(amount) filter (where type = 'borrow') as borrowed,
         sum(amount) filter (where type = 'repay')  as repaid,
         coalesce(sum(coalesce(interest_amount, 0)) filter (where type = 'repay'), 0)
           + coalesce(sum(amount) filter (where type = 'charge'), 0) as interest_paid,
         max(occurred_on) as last_txn_on,
         count(*)         as txn_count
  from public.holding_transactions
  group by holding_id
) tx on tx.holding_id = h.id;

grant select on public.holding_current to authenticated;

-- ---------------------------------------------------------------------------
-- assets_overview(p_holder): totals + breakdowns over ACTIVE holdings.
-- ---------------------------------------------------------------------------

create or replace function public.assets_overview(p_holder uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with h as (
    select *, coalesce(holder_id, user_id) as holder
    from public.holding_current
    where status = 'active'
      and (p_holder is null or coalesce(holder_id, user_id) = p_holder)
  )
  select jsonb_build_object(
    'assets',         coalesce((select sum(current_value) from h where kind = 'asset'), 0),
    'debts',          coalesce((select sum(current_value) from h where kind = 'debt'), 0),
    'invested',       coalesce((select sum(invested) from h where kind = 'asset'), 0),
    'gain',           coalesce((select sum(gain) from h where kind = 'asset'), 0),
    'holdings_count', (select count(*) from h),
    'stale_count',    (select count(*) from h
                       where kind = 'asset' and (last_valued_on is null or last_valued_on < current_date - 30)),
    'last_valued_on', (select max(last_valued_on) from h),
    'by_category', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', c.id, 'name', c.name, 'icon', c.icon, 'color', c.color, 'kind', c.kind,
                 'asset_class', c.asset_class, 'valuation_mode', c.valuation_mode,
                 'current',        coalesce(x.current_value, 0),
                 'invested',       coalesce(x.invested, 0),
                 'withdrawn',      coalesce(x.withdrawn, 0),
                 'gain',           coalesce(x.gain, 0),
                 'holdings_count', coalesce(x.n, 0),
                 'target',         t.amount)
               order by c.kind, coalesce(x.current_value, 0) desc, c.sort_order, c.name)
      from public.asset_categories c
      left join (
        select category_id,
               sum(current_value) as current_value,
               sum(invested)      as invested,
               sum(withdrawn)     as withdrawn,
               sum(gain)          as gain,
               count(*)           as n
        from h
        group by category_id
      ) x on x.category_id = c.id
      left join public.asset_targets t on t.category_id = c.id
      where x.category_id is not null or t.id is not null
    ), '[]'::jsonb),
    'by_holder', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', p.holder, 'assets', p.assets, 'debts', p.debts, 'count', p.n)
               order by p.assets desc)
      from (
        select holder,
               coalesce(sum(current_value) filter (where kind = 'asset'), 0) as assets,
               coalesce(sum(current_value) filter (where kind = 'debt'), 0)  as debts,
               count(*) as n
        from h
        group by holder
      ) p
    ), '[]'::jsonb),
    'by_class', coalesce((
      select jsonb_agg(
               jsonb_build_object('asset_class', q.asset_class, 'current', q.total, 'count', q.n)
               order by q.total desc)
      from (
        select asset_class, sum(current_value) as total, count(*) as n
        from h
        where kind = 'asset'
        group by asset_class
      ) q
    ), '[]'::jsonb),
    'maturing', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', m.id, 'name', m.name, 'holder_id', m.holder,
                 'category_name', m.category_name, 'category_icon', m.category_icon,
                 'category_color', m.category_color,
                 'maturity_on', m.maturity_on, 'current', m.current_value)
               order by m.maturity_on)
      from h m
      where m.maturity_on is not null and m.maturity_on <= current_date + 60
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.assets_overview(uuid) from public, anon;
grant  execute on function public.assets_overview(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- assets_activity(start, end): cash flows in the period.
-- ---------------------------------------------------------------------------

create or replace function public.assets_activity(p_start date, p_end date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with t as (
    select t.type, t.amount, coalesce(t.interest_amount, 0) as interest_amount, t.occurred_on,
           h.category_id, coalesce(h.holder_id, h.user_id) as holder
    from public.holding_transactions t
    join public.holdings h on h.id = t.holding_id
    where t.occurred_on between p_start and p_end
  ),
  sums as (
    select
      coalesce(sum(amount) filter (where type = 'invest'), 0) as invested,
      coalesce(sum(amount) filter (where type = 'redeem'), 0) as redeemed,
      coalesce(sum(amount) filter (where type = 'income'), 0) as income,
      coalesce(sum(amount) filter (where type = 'borrow'), 0) as borrowed,
      coalesce(sum(amount) filter (where type = 'repay'), 0)  as repaid,
      coalesce(sum(amount) filter (where type = 'charge'), 0) as charged,
      coalesce(sum(interest_amount) filter (where type = 'repay'), 0)
        + coalesce(sum(amount) filter (where type = 'charge'), 0) as interest_paid,
      count(*) as count
    from t
  )
  select jsonb_build_object(
    'invested', s.invested, 'redeemed', s.redeemed, 'income', s.income,
    'borrowed', s.borrowed, 'repaid', s.repaid, 'charged', s.charged,
    'interest_paid', s.interest_paid, 'count', s.count,
    'by_category', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', c.id, 'name', c.name, 'icon', c.icon, 'color', c.color, 'kind', c.kind,
                 'invested', x.invested, 'redeemed', x.redeemed, 'income', x.income,
                 'borrowed', x.borrowed, 'repaid', x.repaid, 'charged', x.charged, 'count', x.n)
               order by (x.invested + x.borrowed + x.redeemed + x.repaid) desc)
      from (
        select category_id,
               coalesce(sum(amount) filter (where type = 'invest'), 0) as invested,
               coalesce(sum(amount) filter (where type = 'redeem'), 0) as redeemed,
               coalesce(sum(amount) filter (where type = 'income'), 0) as income,
               coalesce(sum(amount) filter (where type = 'borrow'), 0) as borrowed,
               coalesce(sum(amount) filter (where type = 'repay'), 0)  as repaid,
               coalesce(sum(amount) filter (where type = 'charge'), 0) as charged,
               count(*) as n
        from t
        group by category_id
      ) x
      join public.asset_categories c on c.id = x.category_id
    ), '[]'::jsonb),
    'by_holder', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', p.holder, 'invested', p.invested, 'redeemed', p.redeemed, 'income', p.income,
                 'borrowed', p.borrowed, 'repaid', p.repaid, 'count', p.n)
               order by p.invested desc)
      from (
        select holder,
               coalesce(sum(amount) filter (where type = 'invest'), 0) as invested,
               coalesce(sum(amount) filter (where type = 'redeem'), 0) as redeemed,
               coalesce(sum(amount) filter (where type = 'income'), 0) as income,
               coalesce(sum(amount) filter (where type = 'borrow'), 0) as borrowed,
               coalesce(sum(amount) filter (where type = 'repay'), 0)  as repaid,
               count(*) as n
        from t
        group by holder
      ) p
    ), '[]'::jsonb),
    'by_month', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'month', to_char(q.m, 'YYYY-MM'),
                 'invested', q.invested, 'redeemed', q.redeemed, 'income', q.income,
                 'borrowed', q.borrowed, 'repaid', q.repaid, 'charged', q.charged)
               order by q.m)
      from (
        select date_trunc('month', occurred_on)::date as m,
               coalesce(sum(amount) filter (where type = 'invest'), 0) as invested,
               coalesce(sum(amount) filter (where type = 'redeem'), 0) as redeemed,
               coalesce(sum(amount) filter (where type = 'income'), 0) as income,
               coalesce(sum(amount) filter (where type = 'borrow'), 0) as borrowed,
               coalesce(sum(amount) filter (where type = 'repay'), 0)  as repaid,
               coalesce(sum(amount) filter (where type = 'charge'), 0) as charged
        from t
        group by 1
      ) q
    ), '[]'::jsonb)
  )
  from sums s;
$$;

revoke execute on function public.assets_activity(date, date) from public, anon;
grant  execute on function public.assets_activity(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- networth_history(year): assets / debts at each month end of the year (only
-- months that have started; the client pads to 12 with null). O(months x
-- holdings) lateral calls; closed holdings drop out after closed_on.
-- ---------------------------------------------------------------------------

create or replace function public.networth_history(p_year int)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with months as (
    select g as m,
           (make_date(p_year, g, 1) + interval '1 month - 1 day')::date as month_end
    from generate_series(1, 12) as g
    where make_date(p_year, g, 1) <= current_date
  ),
  pts as (
    select mo.m, c.kind, s.current_value
    from months mo
    cross join public.holdings h
    join public.asset_categories c on c.id = h.category_id
    left join lateral public.holding_value_at(h.id, c.kind, c.valuation_mode, mo.month_end) s on true
    where h.closed_on is null or h.closed_on > mo.month_end
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'month',  to_char(mo.month_end, 'YYYY-MM'),
             'assets', coalesce(a.assets, 0),
             'debts',  coalesce(a.debts, 0))
           order by mo.m), '[]'::jsonb)
  from months mo
  left join (
    select m,
           sum(current_value) filter (where kind = 'asset') as assets,
           sum(current_value) filter (where kind = 'debt')  as debts
    from pts
    group by m
  ) a on a.m = mo.m;
$$;

revoke execute on function public.networth_history(int) from public, anon;
grant  execute on function public.networth_history(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Default types (global, fixed ids so the seed can reference them). Every
-- icon here must exist in src/modules/expenses/components/category-icons.ts.
-- ---------------------------------------------------------------------------

insert into public.asset_categories (id, user_id, kind, name, icon, color, sort_order, valuation_mode, asset_class) values
  -- assets
  ('b0000000-0000-4000-8000-000000000001', null, 'asset', 'Stocks',                                 'chart-candlestick', '#2563eb', 10,  'units', 'equity'),
  ('b0000000-0000-4000-8000-000000000002', null, 'asset', 'Mutual Funds',                           'chart-line',        '#7c3aed', 20,  'units', 'equity'),
  ('b0000000-0000-4000-8000-000000000003', null, 'asset', 'ETFs',                                   'layers',            '#6366f1', 30,  'units', 'equity'),
  ('b0000000-0000-4000-8000-000000000004', null, 'asset', 'Fixed Deposits',                         'landmark',          '#0ea5e9', 40,  'value', 'debt'),
  ('b0000000-0000-4000-8000-000000000005', null, 'asset', 'Recurring Deposits',                     'repeat',            '#06b6d4', 50,  'value', 'debt'),
  ('b0000000-0000-4000-8000-000000000006', null, 'asset', 'Savings Account',                        'wallet',            '#14b8a6', 60,  'value', 'cash'),
  ('b0000000-0000-4000-8000-000000000007', null, 'asset', 'Cash',                                   'banknote',          '#22c55e', 70,  'value', 'cash'),
  ('b0000000-0000-4000-8000-000000000008', null, 'asset', 'PPF',                                    'piggy-bank',        '#16a34a', 80,  'value', 'debt'),
  ('b0000000-0000-4000-8000-000000000009', null, 'asset', 'EPF / PF',                               'briefcase',         '#84cc16', 90,  'value', 'debt'),
  ('b0000000-0000-4000-8000-000000000010', null, 'asset', 'NPS',                                    'shield-check',      '#0d9488', 100, 'value', 'other'),
  ('b0000000-0000-4000-8000-000000000011', null, 'asset', 'Bonds / Debentures',                     'file-text',         '#64748b', 110, 'value', 'debt'),
  ('b0000000-0000-4000-8000-000000000012', null, 'asset', 'P2P Lending',                            'handshake',         '#f59e0b', 120, 'value', 'debt'),
  ('b0000000-0000-4000-8000-000000000013', null, 'asset', 'Physical Gold',                          'gem',               '#eab308', 130, 'units', 'gold'),
  ('b0000000-0000-4000-8000-000000000014', null, 'asset', 'Digital Gold / SGB',                     'coins',             '#f59e0b', 140, 'units', 'gold'),
  ('b0000000-0000-4000-8000-000000000015', null, 'asset', 'Silver',                                 'sparkles',          '#64748b', 150, 'units', 'gold'),
  ('b0000000-0000-4000-8000-000000000016', null, 'asset', 'Real Estate',                            'building-2',        '#f97316', 160, 'value', 'real_estate'),
  ('b0000000-0000-4000-8000-000000000017', null, 'asset', 'Land',                                   'land-plot',         '#65a30d', 170, 'value', 'real_estate'),
  ('b0000000-0000-4000-8000-000000000018', null, 'asset', 'Vehicle',                                'car',               '#3b82f6', 180, 'value', 'other'),
  ('b0000000-0000-4000-8000-000000000019', null, 'asset', 'Crypto',                                 'bitcoin',           '#ea580c', 190, 'units', 'other'),
  ('b0000000-0000-4000-8000-000000000020', null, 'asset', 'Insurance (ULIP / Endowment)',           'shield',            '#0891b2', 200, 'value', 'other'),
  ('b0000000-0000-4000-8000-000000000021', null, 'asset', 'Post Office Schemes (NSC/KVP/SSY/SCSS)', 'mailbox',           '#ef4444', 210, 'value', 'debt'),
  ('b0000000-0000-4000-8000-000000000022', null, 'asset', 'ESOPs / RSUs',                           'award',             '#a855f7', 220, 'units', 'equity'),
  ('b0000000-0000-4000-8000-000000000023', null, 'asset', 'Chit Fund',                              'users',             '#db2777', 230, 'value', 'other'),
  ('b0000000-0000-4000-8000-000000000024', null, 'asset', 'Money Lent',                             'hand-coins',        '#10b981', 240, 'value', 'other'),
  ('b0000000-0000-4000-8000-000000000025', null, 'asset', 'Other Asset',                            'tag',               '#64748b', 900, 'value', 'other'),
  -- debts (trigger forces value mode / null class)
  ('b0000000-0000-4000-8000-000000000041', null, 'debt',  'Home Loan',                              'home',              '#ef4444', 10,  'value', null),
  ('b0000000-0000-4000-8000-000000000042', null, 'debt',  'Car / Vehicle Loan',                     'car',               '#f97316', 20,  'value', null),
  ('b0000000-0000-4000-8000-000000000043', null, 'debt',  'Personal Loan',                          'banknote',          '#f43f5e', 30,  'value', null),
  ('b0000000-0000-4000-8000-000000000044', null, 'debt',  'Education Loan',                         'graduation-cap',    '#6366f1', 40,  'value', null),
  ('b0000000-0000-4000-8000-000000000045', null, 'debt',  'Gold Loan',                              'gem',               '#eab308', 50,  'value', null),
  ('b0000000-0000-4000-8000-000000000046', null, 'debt',  'Credit Card',                            'credit-card',       '#8b5cf6', 60,  'value', null),
  ('b0000000-0000-4000-8000-000000000047', null, 'debt',  'Loan Against Property',                  'building-2',        '#0ea5e9', 70,  'value', null),
  ('b0000000-0000-4000-8000-000000000048', null, 'debt',  'Loan Against Securities',                'chart-line',        '#2563eb', 80,  'value', null),
  ('b0000000-0000-4000-8000-000000000049', null, 'debt',  'Business Loan',                          'store',             '#0d9488', 90,  'value', null),
  ('b0000000-0000-4000-8000-000000000050', null, 'debt',  'Borrowed from Family / Friends',         'users',             '#db2777', 100, 'value', null),
  ('b0000000-0000-4000-8000-000000000051', null, 'debt',  'EMI / BNPL',                             'calendar-clock',    '#f59e0b', 110, 'value', null),
  ('b0000000-0000-4000-8000-000000000052', null, 'debt',  'Other Debt',                             'tag',               '#64748b', 900, 'value', null)
on conflict (id) do nothing;

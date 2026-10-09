-- ---------------------------------------------------------------------------
-- Push notifications (Web Push, Android Chrome).
--
-- * push_subscriptions: one row per browser endpoint, owned by whoever enabled
--   notifications on that device last. Written only through
--   register_push_subscription(); read/deleted by the owner.
-- * notify_dispatch(): POSTs to the `notify` edge function via pg_net. The URL
--   and shared secret come from Supabase Vault (`notify_url`, `notify_secret`),
--   set once per project by hand (README) so nothing secret is in the repo.
--   Without them it logs and does nothing (fresh `db reset`).
-- * pg_cron: daily reminders at 13:00 and 22:00 IST (cron runs in UTC), plus
--   the recurring-due check at 13:00.
-- * Budget alerts: a trigger on transactions notifies once per category per
--   month when spending crosses 80% and 100% of its budget.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
create extension if not exists pg_net with schema extensions;

-- Subscriptions ---------------------------------------------------------------

create table public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  endpoint      text not null unique check (endpoint like 'https://%'),
  p256dh        text not null,
  auth_secret   text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: read own"
  on public.push_subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "push_subscriptions: delete own"
  on public.push_subscriptions for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, delete on public.push_subscriptions to authenticated;

-- An endpoint belongs to a browser, not a person: on a shared phone the row
-- moves to whoever enabled notifications last. A plain upsert can't do that
-- under own-only RLS, hence security definer.
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth_secret, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth_secret, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth_secret = excluded.auth_secret,
        user_agent = excluded.user_agent;
end;
$$;

revoke execute on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- Dispatch --------------------------------------------------------------------

create or replace function public.notify_dispatch(p_kind text, p_payload jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_secret';
  if v_url is null or v_secret is null then
    raise log 'notify_dispatch(%): vault secrets notify_url / notify_secret are not set; skipped', p_kind;
    return false;
  end if;
  -- Queued; pg_net sends it after the calling transaction commits.
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('kind', p_kind) || coalesce(p_payload, '{}'::jsonb),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    timeout_milliseconds := 10000
  );
  return true;
exception when others then
  raise warning 'notify_dispatch(%) failed: %', p_kind, sqlerrm;
  return false;
end;
$$;

revoke execute on function public.notify_dispatch(text, jsonb) from public, anon, authenticated;

-- Budget alerts ---------------------------------------------------------------

-- One row per (budget, month, threshold) already announced. category_key is
-- the category id, or the zero uuid for the overall budget.
create table public.budget_alerts_sent (
  category_key  uuid not null,
  month         date not null,
  threshold     smallint not null check (threshold in (80, 100)),
  sent_at       timestamptz not null default now(),
  primary key (category_key, month, threshold)
);

-- Only the definer functions below touch it.
alter table public.budget_alerts_sent enable row level security;

create or replace function public.check_budget_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'Asia/Kolkata')::date;
  v_next date := (date_trunc('month', now() at time zone 'Asia/Kolkata') + interval '1 month')::date;
  b record;
  v_spent numeric;
  v_hit smallint;
  v_name text;
begin
  if new.kind <> 'expense' or new.occurred_on < v_month or new.occurred_on >= v_next then
    return null;
  end if;
  -- Not configured (local db reset): don't burn the once-per-month alerts.
  if not exists (select 1 from vault.secrets where name = 'notify_url') then
    return null;
  end if;

  for b in
    select category_id, max(amount) as amount
    from public.budgets
    where month = v_month
      and amount > 0
      and (category_id = new.category_id or category_id is null)
    group by category_id
  loop
    select coalesce(sum(t.amount), 0) into v_spent
    from public.transactions t
    where t.kind = 'expense'
      and t.occurred_on >= v_month and t.occurred_on < v_next
      and (b.category_id is null or t.category_id = b.category_id);

    -- The primary key makes this race-free: of two saves crossing at once,
    -- only one inserts the row and sends.
    with ins as (
      insert into public.budget_alerts_sent (category_key, month, threshold)
      select coalesce(b.category_id, '00000000-0000-0000-0000-000000000000'::uuid), v_month, th
      from unnest(array[80, 100]::smallint[]) as th
      where v_spent * 100 >= b.amount * th
      on conflict do nothing
      returning threshold
    )
    select max(threshold) into v_hit from ins;

    -- Jumping straight past 100% sends one "exceeded" alert, not two.
    if v_hit is not null then
      select c.name into v_name from public.expense_categories c where c.id = b.category_id;
      perform public.notify_dispatch('budget', jsonb_build_object(
        'category_id', b.category_id,
        'category_name', v_name,
        'threshold', v_hit,
        'spent', v_spent,
        'limit', b.amount,
        'month', to_char(v_month, 'YYYY-MM')
      ));
    end if;
  end loop;
  return null;
exception when others then
  -- A notification problem must never block saving a transaction.
  raise warning 'check_budget_alerts failed: %', sqlerrm;
  return null;
end;
$$;

create trigger transactions_budget_alert
  after insert or update of amount, category_id, occurred_on, kind on public.transactions
  for each row execute function public.check_budget_alerts();

-- Raising a budget re-arms the thresholds it is no longer past. Sends nothing.
create or replace function public.rearm_budget_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_spent numeric;
begin
  if new.amount <= old.amount then
    return null;
  end if;
  select coalesce(sum(t.amount), 0) into v_spent
  from public.transactions t
  where t.kind = 'expense'
    and t.occurred_on >= new.month and t.occurred_on < (new.month + interval '1 month')::date
    and (new.category_id is null or t.category_id = new.category_id);

  delete from public.budget_alerts_sent s
  where s.category_key = coalesce(new.category_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and s.month = new.month
    and v_spent * 100 < new.amount * s.threshold;
  return null;
end;
$$;

create trigger budgets_rearm_alerts
  after update of amount on public.budgets
  for each row execute function public.rearm_budget_alerts();

-- Schedules (UTC; IST = UTC+5:30). cron.schedule upserts by job name. ----------

select cron.schedule(
  'notify-1300-ist',
  '30 7 * * *',
  $$select public.notify_dispatch('daily'); select public.notify_dispatch('recurring');$$
);

select cron.schedule(
  'notify-2200-ist',
  '30 16 * * *',
  $$select public.notify_dispatch('daily');$$
);

select cron.schedule(
  'cron-history-cleanup',
  '0 3 * * 0',
  $$delete from cron.job_run_details where end_time < now() - interval '14 days';$$
);

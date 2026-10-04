-- ---------------------------------------------------------------------------
-- ledger_summary: adds `by_method` (totals per payment method and kind).
-- Rows without a method are grouped under 'unspecified'. Everything else is
-- unchanged from 20260908000004_ledger_paging_earned_by.sql.
-- ---------------------------------------------------------------------------

create or replace function public.ledger_summary(p_start date, p_end date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with t as (
    select kind, amount, category_id, user_id, earned_by, occurred_on, payment_method
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
    'by_method', coalesce((
      select jsonb_agg(
               jsonb_build_object('method', m.method, 'kind', m.kind, 'total', m.total, 'count', m.count)
               order by m.total desc)
      from (
        select kind, coalesce(nullif(payment_method, ''), 'unspecified') as method,
               sum(amount) as total, count(*) as count
        from t
        group by 1, 2
      ) m
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

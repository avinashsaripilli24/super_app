-- ---------------------------------------------------------------------------
-- Shared ledger: every signed-in user sees every transaction (with "Added by"),
-- anyone can add, only the creator or an admin can edit/delete. Categories and
-- budgets follow the same rule so shared rows always render for everyone.
-- ---------------------------------------------------------------------------

-- Names for "Added by" without loosening profiles RLS. The view is owned by
-- postgres (security_invoker off), so it bypasses RLS on profiles and exposes
-- only id / full_name / email.
create view public.user_names as
  select id, full_name, email
  from public.profiles;

grant select on public.user_names to authenticated;

comment on column public.transactions.user_id is 'Creator of the row; shown as "Added by".';

-- Owner cannot be reassigned after insert.
create or replace function public.keep_row_owner()
returns trigger
language plpgsql
as $$
begin
  if new.user_id is distinct from old.user_id then
    raise exception 'user_id cannot be changed';
  end if;
  return new;
end;
$$;

create trigger transactions_keep_owner
  before update on public.transactions
  for each row execute function public.keep_row_owner();

create trigger budgets_keep_owner
  before update on public.budgets
  for each row execute function public.keep_row_owner();

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------

drop policy "transactions: owner all" on public.transactions;

create policy "transactions: read all"
  on public.transactions for select
  to authenticated
  using (true);

create policy "transactions: insert own"
  on public.transactions for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "transactions: update own or admin"
  on public.transactions for update
  to authenticated
  using ((select auth.uid()) = user_id or public.is_admin())
  with check ((select auth.uid()) = user_id or public.is_admin());

create policy "transactions: delete own or admin"
  on public.transactions for delete
  to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

-- ---------------------------------------------------------------------------
-- expense_categories (defaults have user_id null; custom ones are shared too)
-- ---------------------------------------------------------------------------

drop policy "categories: read defaults" on public.expense_categories;
drop policy "categories: owner all" on public.expense_categories;

create policy "categories: read all"
  on public.expense_categories for select
  to authenticated
  using (true);

create policy "categories: insert own"
  on public.expense_categories for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "categories: update own or admin"
  on public.expense_categories for update
  to authenticated
  using (user_id is not null and ((select auth.uid()) = user_id or public.is_admin()))
  with check (user_id is not null and ((select auth.uid()) = user_id or public.is_admin()));

create policy "categories: delete own or admin"
  on public.expense_categories for delete
  to authenticated
  using (user_id is not null and ((select auth.uid()) = user_id or public.is_admin()));

-- ---------------------------------------------------------------------------
-- budgets (household budgets)
-- ---------------------------------------------------------------------------

drop policy "budgets: owner all" on public.budgets;

create policy "budgets: read all"
  on public.budgets for select
  to authenticated
  using (true);

create policy "budgets: insert own"
  on public.budgets for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "budgets: update own or admin"
  on public.budgets for update
  to authenticated
  using ((select auth.uid()) = user_id or public.is_admin())
  with check ((select auth.uid()) = user_id or public.is_admin());

create policy "budgets: delete own or admin"
  on public.budgets for delete
  to authenticated
  using ((select auth.uid()) = user_id or public.is_admin());

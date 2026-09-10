-- ---------------------------------------------------------------------------
-- Local development seed. Runs after migrations on `supabase db reset` and on
-- first `supabase start`. NOT applied by `supabase db push`, so the dev
-- passwords below never reach a hosted project.
--
-- Seeded users:
--   admin@superapp.local / Admin@123   (admin)
--   priya@superapp.local / Priya@123   (user)
-- ---------------------------------------------------------------------------

do $$
declare
  u record;
begin
  for u in
    select * from (values
      ('11111111-1111-4111-8111-111111111111'::uuid, 'admin@superapp.local', 'Admin@123', 'Default Admin', 'admin'),
      ('22222222-2222-4222-8222-222222222222'::uuid, 'priya@superapp.local', 'Priya@123', 'Priya Sharma',  'user')
    ) as t(id, email, pwd, full_name, role)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, last_sign_in_at,
      -- GoTrue reads these into non-nullable Go strings: must be '' not NULL.
      confirmation_token, recovery_token, email_change, email_change_token_new,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token,
      is_sso_user, is_anonymous
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt(u.pwd, extensions.gen_salt('bf', 10)),
      now(),
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', u.role),
      jsonb_build_object('full_name', u.full_name),
      now(), now(), now(),
      '', '', '', '',
      '', '', '', '',
      false, false
    ) on conflict (id) do nothing;

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(),
      u.id::text,
      u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
      'email',
      now(), now(), now()
    ) on conflict (provider_id, provider) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Mock shared-ledger data (last ~2 months), split between the two users so
-- "Added by" is visible immediately.
-- ---------------------------------------------------------------------------

-- earned_by is null for expenses; for income the trigger defaults it to the
-- creator, so only cross-person rows spell it out.
insert into public.transactions (user_id, category_id, kind, amount, occurred_on, note, payment_method, earned_by) values
  -- this month: admin
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000011', 'income',  65000.00, date_trunc('month', current_date)::date + 0,  'Monthly salary', 'bank', null),
  -- admin records Priya's freelance payment → "Earned by Priya · Added by Admin"
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000042', 'income',  6500.00,  date_trunc('month', current_date)::date + 2,  'Website project', 'bank', '22222222-2222-4222-8222-222222222222'),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004', 'expense', 1499.00,  date_trunc('month', current_date)::date + 1,  'Broadband', 'upi', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'expense', 320.00,   date_trunc('month', current_date)::date + 1,  'Lunch', 'cash', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000003', 'expense', 2599.00,  date_trunc('month', current_date)::date + 2,  'Shoes', 'card', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004', 'expense', 2200.00,  date_trunc('month', current_date)::date + 4,  'Electricity bill', 'upi', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', 'expense', 210.00,   date_trunc('month', current_date)::date + 5,  'Coffee', 'cash', null),
  -- this month: priya
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000011', 'income',  42000.00, date_trunc('month', current_date)::date + 0,  'Monthly salary', 'bank', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000002', 'expense', 180.00,   date_trunc('month', current_date)::date + 2,  'Auto to office', 'cash', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000001', 'expense', 850.00,   date_trunc('month', current_date)::date + 3,  'Dinner with friends', 'upi', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000006', 'expense', 499.00,   date_trunc('month', current_date)::date + 3,  'Streaming subscription', 'card', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000005', 'expense', 640.00,   date_trunc('month', current_date)::date + 4,  'Pharmacy', 'upi', null),
  -- last month: admin
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000011', 'income',  65000.00, (date_trunc('month', current_date) - interval '1 month')::date + 0,  'Monthly salary', 'bank', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004', 'expense', 1499.00,  (date_trunc('month', current_date) - interval '1 month')::date + 1,  'Broadband', 'upi', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004', 'expense', 12000.00, (date_trunc('month', current_date) - interval '1 month')::date + 2,  'Rent', 'bank', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000021', 'expense', 4200.00,  (date_trunc('month', current_date) - interval '1 month')::date + 6,  'Groceries', 'card', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000003', 'expense', 3200.00,  (date_trunc('month', current_date) - interval '1 month')::date + 12, 'Clothes', 'card', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000005', 'expense', 1800.00,  (date_trunc('month', current_date) - interval '1 month')::date + 20, 'Dental checkup', 'card', null),
  -- last month: priya
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000011', 'income',  42000.00, (date_trunc('month', current_date) - interval '1 month')::date + 0,  'Monthly salary', 'bank', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000042', 'income',  4000.00,  (date_trunc('month', current_date) - interval '1 month')::date + 9,  'Freelance', 'bank', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000023', 'expense', 1500.00,  (date_trunc('month', current_date) - interval '1 month')::date + 8,  'Fuel', 'card', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000006', 'expense', 900.00,   (date_trunc('month', current_date) - interval '1 month')::date + 15, 'Movie night', 'upi', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000001', 'expense', 560.00,   (date_trunc('month', current_date) - interval '1 month')::date + 18, 'Takeaway', 'upi', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000034', 'expense', 750.00,   (date_trunc('month', current_date) - interval '1 month')::date + 24, 'Gift', 'cash', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000002', 'expense', 320.00,   (date_trunc('month', current_date) - interval '1 month')::date + 26, 'Cab', 'upi', null),
  -- earlier this year (so the year view has more than two bars)
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000011', 'income',  65000.00, (date_trunc('month', current_date) - interval '2 month')::date + 0,  'Monthly salary', 'bank', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004', 'expense', 12000.00, (date_trunc('month', current_date) - interval '2 month')::date + 2,  'Rent', 'bank', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000021', 'expense', 3900.00,  (date_trunc('month', current_date) - interval '2 month')::date + 7,  'Groceries', 'card', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000003', 'expense', 5400.00,  (date_trunc('month', current_date) - interval '2 month')::date + 14, 'Phone accessories', 'card', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000011', 'income',  65000.00, (date_trunc('month', current_date) - interval '3 month')::date + 0,  'Monthly salary', 'bank', null),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004', 'expense', 12000.00, (date_trunc('month', current_date) - interval '3 month')::date + 2,  'Rent', 'bank', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000002', 'expense', 2600.00,  (date_trunc('month', current_date) - interval '3 month')::date + 11, 'Train tickets', 'upi', null),
  ('22222222-2222-4222-8222-222222222222', 'a0000000-0000-4000-8000-000000000006', 'expense', 1200.00,  (date_trunc('month', current_date) - interval '3 month')::date + 19, 'Concert', 'card', null);

-- Bulk filler for the current month so the transaction list actually pages
-- (25 rows per page). Small everyday expenses, alternating between both users
-- and a handful of categories; dates never land in the future.
insert into public.transactions (user_id, category_id, kind, amount, occurred_on, note, payment_method)
select
  case when g % 2 = 0 then '11111111-1111-4111-8111-111111111111'::uuid else '22222222-2222-4222-8222-222222222222'::uuid end,
  (array[
    'a0000000-0000-4000-8000-000000000001',  -- Food & Dining
    'a0000000-0000-4000-8000-000000000021',  -- Groceries
    'a0000000-0000-4000-8000-000000000002',  -- Transport
    'a0000000-0000-4000-8000-000000000023',  -- Fuel
    'a0000000-0000-4000-8000-000000000027',  -- Subscriptions
    'a0000000-0000-4000-8000-000000000033',  -- Charity
    'a0000000-0000-4000-8000-000000000034'   -- Gifts
  ])[1 + (g % 7)]::uuid,
  'expense',
  60 + (g * 37) % 900,
  least(date_trunc('month', current_date)::date + (g % 20), current_date),
  (array['Tea & snacks', 'Vegetables', 'Metro card top-up', 'Petrol', 'Cloud storage', 'Donation', 'Birthday gift'])[1 + (g % 7)],
  (array['upi', 'cash', 'card'])[1 + (g % 3)]
from generate_series(1, 40) as g;

insert into public.budgets (user_id, category_id, month, amount) values
  ('11111111-1111-4111-8111-111111111111', null, date_trunc('month', current_date)::date, 30000.00),
  ('11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', date_trunc('month', current_date)::date, 6000.00);

-- ---------------------------------------------------------------------------
-- Mock assets & debts: 12 holdings across both users, dated relative to today
-- so the Activity month/year views and the net-worth trend show data.
-- Holding ids c0000000-0000-4000-8000-0000000000NN.
-- ---------------------------------------------------------------------------

insert into public.holdings (id, user_id, category_id, holder_id, name, institution, identifier, status, opened_on, maturity_on, interest_rate, closed_on) values
  ('c0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000002', null, 'HDFC Flexi Cap Fund', 'HDFC MF',    'Folio 1234567',  'active', current_date - 200, null,                null, null),
  ('c0000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', null, 'Infosys',             'Zerodha',    'INFY',           'active', current_date - 250, null,                null, null),
  ('c0000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000004', null, 'SBI FD 7.1%',         'SBI',        'FD-8891',        'active', current_date - 320, current_date + 45,   7.1,  null),
  ('c0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000008', null, 'PPF',                 'SBI',        null,             'active', current_date - 400, current_date + 3650, 7.1,  null),
  -- admin records Priya's gold → Holder Priya, Added by Admin
  ('c0000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000013', '22222222-2222-4222-8222-222222222222', 'Gold coins (grams)', null, null, 'active', current_date - 420, null, null, null),
  ('c0000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000002', null, 'Nifty 50 Index Fund', 'Groww',      'Folio 7654321',  'active', current_date - 900, null,                null, null),
  ('c0000000-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000009', null, 'EPF',                 'EPFO',       'UAN 1002003004', 'active', current_date - 100, null,                8.25, null),
  ('c0000000-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000006', null, 'Savings - ICICI',     'ICICI Bank', 'xx4421',         'active', null,               null,                null, null),
  ('c0000000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000016', null, 'Flat - Hyderabad',    null,         null,             'active', current_date - 730, null,                null, null),
  ('c0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000041', null, 'HDFC Home Loan',      'HDFC Bank',  'HL-55210',       'active', current_date - 730, current_date + 6570, 8.5,  null),
  ('c0000000-0000-4000-8000-000000000011', '22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000046', null, 'Axis credit card',    'Axis Bank',  'xx9910',         'active', null,               null,                null, null),
  ('c0000000-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000005', null, 'Old RD (matured)',    'SBI',        null,             'closed', current_date - 420, current_date - 60,   6.5,  current_date - 60);

insert into public.holding_transactions (user_id, holding_id, occurred_on, type, amount, quantity, unit_price, interest_amount, note) values
  -- c01 flexi cap: two lump sums (units mode)
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000001', current_date - 180, 'invest', 50000,   1000, 50,   null, 'Lump sum'),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000001', current_date - 90,  'invest', 22000,   400,  55,   null, 'Top-up'),
  -- c02 Infosys: buy + dividend
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000002', current_date - 240, 'invest', 43500,   30,   1450, null, null),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000002', current_date - 60,  'income', 660,     null, null, null, 'Dividend'),
  -- c03 FD, c04 PPF (value mode)
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000003', current_date - 320, 'invest', 200000,  null, null, null, 'Opened FD'),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000004', current_date - 365, 'invest', 150000,  null, null, null, null),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000004', current_date - 40,  'invest', 150000,  null, null, null, null),
  -- c05 gold (units = grams)
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000005', current_date - 420, 'invest', 122000,  20,   6100, null, '20g coins'),
  -- c07 EPF: opening balance + monthly contributions (one last month, one this month)
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000007', current_date - 100, 'invest', 36000,   null, null, null, 'Opening balance'),
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000007', date_trunc('month', current_date)::date - 1, 'invest', 6000, null, null, null, 'Monthly contribution'),
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000007', least(date_trunc('month', current_date)::date + 5, current_date), 'invest', 6000, null, null, null, 'Monthly contribution'),
  -- c09 flat
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000009', current_date - 730, 'invest', 4500000, null, null, null, 'Purchase'),
  -- c10 home loan: disbursal, then EMIs with interest split (a valuation below snapshots the outstanding)
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000010', current_date - 730, 'borrow', 3000000, null, null, null,  'Disbursal'),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000010', (date_trunc('month', current_date) - interval '3 month')::date + 5, 'repay', 26000, null, null, 20500, 'EMI'),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000010', (date_trunc('month', current_date) - interval '2 month')::date + 5, 'repay', 26000, null, null, 20450, 'EMI'),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000010', (date_trunc('month', current_date) - interval '1 month')::date + 5, 'repay', 26000, null, null, 20400, 'EMI'),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000010', least(date_trunc('month', current_date)::date + 5, current_date),      'repay', 26000, null, null, 20350, 'EMI'),
  -- c11 credit card: statement, payment, new charges
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000011', current_date - 40, 'charge', 22000, null, null, null, 'Statement'),
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000011', current_date - 12, 'repay',  22000, null, null, 0,    'Paid in full'),
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000011', current_date - 6,  'charge', 18500, null, null, null, 'This month so far'),
  -- c12 closed RD: deposit then final redemption (current 0, gain 4100)
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000012', current_date - 420, 'invest', 60000, null, null, null, null),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000012', current_date - 60,  'redeem', 64100, null, null, null, 'Matured');

-- Priya's SIP on c06: 30 monthly buys so the activity list pages (25 per page).
-- NAV rises 2/month up to 215 (the latest buy matches the valuation below, so
-- the "latest known price" rule agrees with it).
insert into public.holding_transactions (user_id, holding_id, occurred_on, type, amount, quantity, unit_price, note)
select '22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000006',
       least((date_trunc('month', current_date) - (g || ' month')::interval)::date + 4, current_date),
       'invest', 5000, round(5000.0 / (215 - g * 2), 4), 215 - g * 2, 'SIP'
from generate_series(0, 29) as g;

-- Valuations. In units mode the app writes value = units x price; the value
-- rule only reads unit_price, so c06's value is an approximation here.
insert into public.holding_valuations (user_id, holding_id, as_of, value, unit_price, note) values
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000001', current_date - 40, 81200,   58,   null),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000001', current_date - 5,  84700,   60.5, null),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000002', current_date - 5,  48600,   1620, null),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000003', current_date - 10, 211500,  null, 'Accrued interest'),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000004', current_date - 15, 318400,  null, 'Passbook'),
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000005', current_date - 5,  147000,  7350, null),
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000006', current_date - 3,  181200,  215,  null),
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000007', current_date - 20, 49200,   null, null),
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000008', current_date - 2,  85000,   null, null),
  ('22222222-2222-4222-8222-222222222222', 'c0000000-0000-4000-8000-000000000009', current_date - 60, 5200000, null, 'Broker estimate'),
  ('11111111-1111-4111-8111-111111111111', 'c0000000-0000-4000-8000-000000000010', (date_trunc('month', current_date) - interval '4 month')::date, 2900000, null, 'Loan statement');

insert into public.asset_targets (user_id, category_id, amount) values
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000002', 500000),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000001', 200000),
  ('11111111-1111-4111-8111-111111111111', 'b0000000-0000-4000-8000-000000000004', 300000),
  ('22222222-2222-4222-8222-222222222222', 'b0000000-0000-4000-8000-000000000013', 200000);

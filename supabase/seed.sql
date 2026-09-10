-- ---------------------------------------------------------------------------
-- Seed: the default admin only. Runs after migrations on `supabase db reset`
-- (local) and, once, on the hosted project via `supabase db push
-- --include-seed`.
--
--   Mobile 9999999999 / password Admin@1234   (admin)
--
-- Both are placeholders and this repo is public: right after the first
-- sign-in, change the number (Users → Change mobile number) and the password
-- (Settings). Re-running the seed never resets them (on conflict do nothing).
--
-- Login is mobile + password; auth runs on the internal email derived from the
-- number (src/lib/phone.ts), and handle_new_user() copies app_metadata.phone
-- into profiles.phone.
-- ---------------------------------------------------------------------------

do $$
declare
  admin_id    constant uuid := '11111111-1111-4111-8111-111111111111';
  admin_email constant text := '919999999999@phone.superapp.local';
begin
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
    '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated', admin_email,
    extensions.crypt('Admin@1234', extensions.gen_salt('bf', 10)),
    now(),
    jsonb_build_object(
      'provider', 'email', 'providers', jsonb_build_array('email'),
      'role', 'admin', 'phone', '+919999999999'
    ),
    jsonb_build_object('full_name', 'Default Admin'),
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
    admin_id::text,
    admin_id,
    jsonb_build_object('sub', admin_id::text, 'email', admin_email, 'email_verified', true, 'phone_verified', false),
    'email',
    now(), now(), now()
  ) on conflict (provider_id, provider) do nothing;
end $$;

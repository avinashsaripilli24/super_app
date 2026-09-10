-- ---------------------------------------------------------------------------
-- Mobile-number login. Users sign in with a mobile number + password; no SMS
-- provider is involved. Each number maps to an internal auth email
-- (<digits>@phone.superapp.local, see src/lib/phone.ts), so auth is ordinary
-- email+password and profiles.email keeps holding that internal address.
-- profiles.phone (E.164, e.g. +919999999999) is the identity shown in the UI.
-- ---------------------------------------------------------------------------

alter table public.profiles add column phone text;

create unique index profiles_phone_key on public.profiles (phone) where phone is not null;

comment on column public.profiles.phone is
  'Login mobile number (E.164). Set from app_metadata.phone on create; admin-only like role.';

-- Same as before, plus phone. Like role, it comes from app_metadata, which end
-- users cannot edit (the admin-users edge function and the seed write it).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, phone, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_app_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'full_name',
    coalesce((new.raw_app_meta_data ->> 'role')::public.app_role, 'user')
  );
  return new;
end;
$$;

-- Appending a column keeps the view (and its grant) in place.
create or replace view public.user_names as
  select id, full_name, email, phone
  from public.profiles;

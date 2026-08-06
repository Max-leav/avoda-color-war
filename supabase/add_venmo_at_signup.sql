-- ============================================================================
-- CHANGE: collect the Venmo handle at signup, drop the phone digits
--
-- The handle is captured on the signup form and rides along in the auth
-- user's metadata, then this trigger copies it into user_payment_info when
-- the account row is created.
--
-- Why metadata rather than a POST after signup: when email confirmation is
-- turned on, signUp() doesn't return a session, so there's nothing to
-- authenticate a follow-up write with. The handle would be silently dropped
-- for exactly the accounts that took the longest to create. Metadata is
-- attached to the account itself and survives the confirmation round trip.
--
-- Safe to run multiple times.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drop the phone digits. Also drops its check constraint automatically.
-- ----------------------------------------------------------------------------

alter table public.user_payment_info drop column if exists phone_last4;

-- ----------------------------------------------------------------------------
-- 2. Signup trigger: create the profile, and stash the Venmo handle if one
--    came through.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger as $$
declare
  submitted_handle text;
begin
  insert into public.users (id, username, email, balance)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    0.00
  )
  on conflict (id) do nothing;

  -- Strip a leading @ and only keep it if it matches the allowed shape. The
  -- check constraint on the column would otherwise raise here, and an error
  -- inside this trigger aborts the whole signup -- a malformed handle must
  -- never be the reason someone can't create an account.
  submitted_handle := ltrim(coalesce(new.raw_user_meta_data->>'venmo_handle', ''), '@');

  if submitted_handle ~ '^[A-Za-z0-9_-]{3,30}$' then
    insert into public.user_payment_info (user_id, venmo_handle)
    values (new.id, submitted_handle)
    on conflict (user_id) do update set
      venmo_handle = excluded.venmo_handle,
      updated_at = now();
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. Check: the column should be gone, and handles should appear here as
--    people sign up.
-- ----------------------------------------------------------------------------

select user_id, venmo_handle, updated_at from public.user_payment_info;

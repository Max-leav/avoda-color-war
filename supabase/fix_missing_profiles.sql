-- ============================================================================
-- FIX: backfill public.users rows for any auth.users that are missing one,
-- and make the signup trigger idempotent so this can't happen again.
-- Safe to run multiple times.
-- ============================================================================

-- 1. Recreate the trigger function (idempotent via CREATE OR REPLACE).
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, username, email, balance)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    0.00
  )
  on conflict (id) do nothing;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Backfill: create a public.users row for any existing auth.users that's
--    missing one (this is what fixes your currently-broken accounts).
insert into public.users (id, username, email, balance)
select
  au.id,
  coalesce(au.raw_user_meta_data->>'username', split_part(au.email, '@', 1)),
  au.email,
  0.00
from auth.users au
left join public.users pu on pu.id = au.id
where pu.id is null;


-- 3. Sanity check -- run this after and confirm every auth user has a match.
select au.email, pu.id is not null as has_profile, pu.balance
from auth.users au
left join public.users pu on pu.id = au.id
order by au.created_at;

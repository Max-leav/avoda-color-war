-- ============================================================================
-- CHANGE: new accounts start at 0 credits instead of 1000
--
-- Two separate things hand out the starting balance, and both have to change
-- or new signups keep getting 1000: the column default on public.users, and
-- the handle_new_user() trigger that runs on signup. Run all of section 1.
--
-- Section 2 is optional and destructive -- read it before running it.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. New accounts from here on start at zero.
-- ----------------------------------------------------------------------------

alter table public.users alter column balance set default 0.00;

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


-- ----------------------------------------------------------------------------
-- 2. OPTIONAL -- zero out the accounts that already got 1000 credits.
--
-- Section 1 only affects future signups. Anyone who signed up under the old
-- rules keeps their 1000. If those are just your test accounts, uncomment
-- this to wipe the slate; if real people have already been betting, leave it
-- alone, because it will erase balances they earned.
--
-- Not reversible. Nothing here restores what it clears.
-- ----------------------------------------------------------------------------

-- update public.users set balance = 0.00;
--
-- insert into public.transactions (user_id, type, amount, description)
-- select id, 'admin_adjustment', 0, 'Balance reset to 0 -- credits now issued by an admin'
-- from public.users;


-- ----------------------------------------------------------------------------
-- 3. Check: confirm the default took, then look at where balances stand.
-- ----------------------------------------------------------------------------

select column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'users' and column_name = 'balance';

select username, email, balance from public.users order by balance desc;

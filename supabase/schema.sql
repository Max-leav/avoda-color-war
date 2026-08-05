-- ============================================================================
-- PLAY-MONEY PREDICTION MARKET -- SUPABASE SCHEMA
-- ============================================================================
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- IMPORTANT: This schema uses virtual "credits" (a points balance), not real
-- currency. There is no deposit/withdraw flow and no connection to any real
-- payment method. Keep it that way -- see the README for why.
-- ============================================================================

-- ============================================================================
-- CLEANUP (allows this script to be run repeatedly)
-- ============================================================================

-- Drop trigger first (depends on function)
drop trigger if exists on_auth_user_created on auth.users;

-- Drop function
drop function if exists public.handle_new_user();

-- Drop policies
drop policy if exists "users are viewable by everyone" on public.users;
drop policy if exists "markets are viewable by everyone" on public.markets;
drop policy if exists "bets are viewable by everyone" on public.bets;
drop policy if exists "users can view their own transactions" on public.transactions;

-- Drop tables (CASCADE removes indexes, constraints, foreign keys, etc.)
drop table if exists public.transactions cascade;
drop table if exists public.bets cascade;
drop table if exists public.markets cascade;
drop table if exists public.users cascade;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text unique not null,
  balance numeric(12,2) not null default 1000.00,  -- virtual credits, not money
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.markets (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.users(id) on delete set null,
  title text not null,
  description text,
  close_time timestamptz not null,
  resolved boolean not null default false,
  winning_side text check (winning_side in ('yes', 'no')),
  yes_pool numeric(12,2) not null default 0,
  no_pool numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  side text not null check (side in ('yes', 'no')),
  amount numeric(12,2) not null check (amount > 0),
  price numeric(5,4) not null,
  payout numeric(12,2),
  timestamp timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('signup_bonus', 'bet_placed', 'payout', 'admin_adjustment')),
  amount numeric(12,2) not null,
  description text,
  timestamp timestamptz not null default now()
);

create index bets_market_id_idx on public.bets(market_id);
create index bets_user_id_idx on public.bets(user_id);
create index transactions_user_id_idx on public.transactions(user_id);

alter table public.users enable row level security;
alter table public.markets enable row level security;
alter table public.bets enable row level security;
alter table public.transactions enable row level security;

create policy "users are viewable by everyone"
  on public.users for select using (true);

-- No client-side UPDATE policy is granted on public.users. This is
-- deliberate: balance and is_admin must only ever change through the
-- server-side API routes (bet placement, market resolution, admin balance
-- adjustment), which use the service role key and bypass RLS after their
-- own validation. If a user could UPDATE their own row directly, they could
-- set their own balance or is_admin from the browser dev tools.

create policy "markets are viewable by everyone"
  on public.markets for select using (true);

create policy "bets are viewable by everyone"
  on public.bets for select using (true);

create policy "users can view their own transactions"
  on public.transactions for select using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger as $$
declare
  base_username text;
  final_username text;
  suffix int := 0;
begin
  base_username := coalesce(
    nullif(new.raw_user_meta_data->>'username', ''),
    split_part(new.email, '@', 1)
  );
  final_username := base_username;

  -- username is UNIQUE, so two people whose emails share a local-part
  -- (max@a.com / max@b.com) would collide and abort the whole signup.
  -- Append a counter instead of failing.
  while exists (select 1 from public.users u where u.username = final_username) loop
    suffix := suffix + 1;
    final_username := base_username || suffix::text;
  end loop;

  insert into public.users (id, username, email, balance)
  values (new.id, final_username, new.email, 1000.00)
  on conflict (id) do nothing;

  insert into public.transactions (user_id, type, amount, description)
  values (new.id, 'signup_bonus', 1000.00, 'Welcome bonus -- play-money credits');

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ============================================================================
-- MIGRATION -- run this instead if you already ran this schema once before
-- and just need to add admin support to an existing database. Paste ONLY
-- the block below into the SQL Editor (skip everything above, since those
-- tables already exist). Safe to run even if is_admin already exists.
-- ============================================================================
-- alter table public.users add column if not exists is_admin boolean not null default false;
-- drop policy if exists "users can update their own profile" on public.users;

-- ============================================================================
-- DIAGNOSTIC -- "my balance shows as ... in the navbar"
-- ============================================================================
-- The navbar reads public.users. A person can exist in auth.users (they can
-- sign in) but have NO public.users row -- which is exactly what happens to
-- anyone who signed up BEFORE this schema was run, since the
-- on_auth_user_created trigger only fires on new signups.
--
-- Run this to list accounts that are missing their profile row:
--
-- select a.id, a.email, a.created_at
-- from auth.users a
-- left join public.users u on u.id = a.id
-- where u.id is null
-- order by a.created_at;

-- ============================================================================
-- BACKFILL -- creates the missing profile rows + signup bonus, idempotent.
-- Safe to run repeatedly; it only touches auth users with no profile.
-- ============================================================================
-- insert into public.users (id, username, email, balance)
-- select
--   a.id,
--   -- de-duplicate usernames by appending the first chunk of the uuid
--   case
--     when exists (
--       select 1 from public.users u
--       where u.username = split_part(a.email, '@', 1)
--     )
--     then split_part(a.email, '@', 1) || '-' || left(a.id::text, 4)
--     else split_part(a.email, '@', 1)
--   end,
--   a.email,
--   1000.00
-- from auth.users a
-- left join public.users u on u.id = a.id
-- where u.id is null;
--
-- insert into public.transactions (user_id, type, amount, description)
-- select u.id, 'signup_bonus', 1000.00, 'Welcome bonus -- play-money credits'
-- from public.users u
-- where not exists (
--   select 1 from public.transactions t
--   where t.user_id = u.id and t.type = 'signup_bonus'
-- );


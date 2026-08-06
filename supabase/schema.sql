-- ============================================================================
-- PLAY-MONEY PREDICTION MARKET -- SUPABASE SCHEMA
-- ============================================================================
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- IMPORTANT: This schema uses virtual "credits" (a points balance), not real
-- currency. There is no deposit/withdraw flow and no connection to any real
-- payment method. Keep it that way -- see the README for why.
-- ============================================================================

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text unique not null,
  balance numeric(12,2) not null default 0.00,  -- virtual credits, not money
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

-- ============================================================================
-- TABLE GRANTS
-- RLS policies decide which rows a role can see, but GRANTs decide whether
-- the role can touch the table at all. Both are required. Without these, the
-- browser client fails with "permission denied for table users" (42501)
-- before any policy above is ever evaluated.
--
-- SELECT only: every write goes through a server-side API route using the
-- service role key, which bypasses RLS after doing its own validation.
-- Granting INSERT/UPDATE here would let a user edit their own balance from
-- the browser console.
-- ============================================================================

grant usage on schema public to anon, authenticated;

grant select on public.users to anon, authenticated;
grant select on public.markets to anon, authenticated;
grant select on public.bets to anon, authenticated;
grant select on public.transactions to authenticated;

alter default privileges in schema public
  grant select on tables to anon, authenticated;

-- ----------------------------------------------------------------------------
-- SERVICE ROLE
-- Every write in this app (creating a market, placing a bet, resolving a
-- market, admin balance adjustments) runs server-side through the service
-- role key. service_role bypasses RLS, but it still needs table GRANTs like
-- any other role -- if the tables were created under a role whose default
-- privileges don't cover it, these were skipped too, and the symptom is a
-- server-side read silently coming back empty.
-- ----------------------------------------------------------------------------

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;

-- Payment details live in their own table so they aren't exposed by the
-- world-readable public.users policy. See supabase/add_payment_info.sql.
create table if not exists public.user_payment_info (
  user_id uuid primary key references public.users(id) on delete cascade,
  venmo_handle text,
  -- Last 4 digits only. Stored as text so leading zeros survive; a numeric
  -- column would turn "0123" into 123.
  phone_last4 text,
  updated_at timestamptz not null default now(),
  constraint phone_last4_is_four_digits
    check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$'),
  constraint venmo_handle_shape
    check (venmo_handle is null or venmo_handle ~ '^[A-Za-z0-9_-]{3,30}$')
);

alter table public.user_payment_info enable row level security;

drop policy if exists "users can view their own payment info" on public.user_payment_info;
create policy "users can view their own payment info"
  on public.user_payment_info for select
  using (auth.uid() = user_id);

-- No INSERT/UPDATE policy on purpose. Writes go through
-- POST /api/profile/payment-info, matching how every other write in this app
-- works -- the client never mutates a table directly.

grant select on public.user_payment_info to authenticated;
grant all privileges on public.user_payment_info to service_role;

create function public.handle_new_user()
returns trigger as $$
begin
  -- New accounts start at zero. Credits come from an admin issuing them
  -- (Admin -> adjust balance), not from signing up, so nobody can farm a
  -- starting stack by registering a second address.
  insert into public.users (id, username, email, balance)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    0.00
  );

  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================================
-- MIGRATION -- run this instead if you already ran this schema once before
-- and just need to add admin support to an existing database. Paste ONLY
-- the block below into the SQL Editor (skip everything above, since those
-- tables already exist). Safe to run even if is_admin already exists.
-- ============================================================================
-- alter table public.users add column if not exists is_admin boolean not null default false;
-- drop policy if exists "users can update their own profile" on public.users;


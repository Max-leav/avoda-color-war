-- ============================================================================
-- ADD: Venmo handle + last 4 phone digits
--
-- These live in their own table rather than as columns on public.users, and
-- that's deliberate. public.users is readable by everyone (that's how the app
-- shows usernames and balances), so a venmo_handle column there would let any
-- signed-in user pull every participant's payment handle and phone digits
-- straight from the API. Postgres RLS filters rows, not columns, so the only
-- clean fix is a separate table with its own policy.
--
-- Result: you can read your own row, nobody else's. Admins read it through a
-- server route using the service role key, which is checked for is_admin
-- before it returns anything.
--
-- Safe to run multiple times.
-- ============================================================================

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

-- ----------------------------------------------------------------------------
-- Verify: should return your own row only (or nothing, before you save any).
-- ----------------------------------------------------------------------------
select user_id, venmo_handle, phone_last4, updated_at
from public.user_payment_info;

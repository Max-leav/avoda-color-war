-- ============================================================================
-- ADD: voiding a market (event cancelled, called off, unresolvable)
--
-- Voided is its own state, not resolved-with-no-winner. Marking a market
-- resolved with a null winning_side would leave every payout path -- the
-- market banner, the position panel, the payout math -- trying to describe a
-- winner that doesn't exist. A separate flag keeps "this had an outcome" and
-- "this never happened" distinguishable everywhere.
--
-- Safe to run multiple times.
-- ============================================================================

alter table public.markets
  add column if not exists voided boolean not null default false;

-- Shown to bettors so a refund doesn't look arbitrary.
alter table public.markets
  add column if not exists void_reason text;

-- 'refund' as a first-class ledger entry. Filing these under 'payout' would
-- make "what did this market pay out" unanswerable after the fact.
alter table public.transactions
  drop constraint if exists transactions_type_check;

alter table public.transactions
  add constraint transactions_type_check
  check (type in ('signup_bonus', 'bet_placed', 'payout', 'admin_adjustment', 'refund'));

-- ----------------------------------------------------------------------------
-- Check
-- ----------------------------------------------------------------------------

select title, resolved, voided, void_reason
from public.markets
order by created_at desc;

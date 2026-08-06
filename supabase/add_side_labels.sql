-- ============================================================================
-- ADD: custom names for a market's two sides (e.g. team names)
--
-- Display only. The stored side values stay 'yes' and 'no' everywhere --
-- bets, pools, winning_side -- so existing markets, payout math and the
-- resolve flow are untouched. Renaming what the sides are CALLED shouldn't
-- mean rewriting what they ARE, and keeping them fixed means a market
-- renamed halfway through doesn't orphan the bets placed before the change.
--
-- Null means "use YES / NO", so every market that already exists keeps
-- working with no backfill.
--
-- Still exactly two sides. This adds names, not options.
--
-- Safe to run multiple times.
-- ============================================================================

alter table public.markets add column if not exists yes_label text;
alter table public.markets add column if not exists no_label text;

alter table public.markets drop constraint if exists yes_label_length;
alter table public.markets add constraint yes_label_length
  check (yes_label is null or char_length(yes_label) between 1 and 20);

alter table public.markets drop constraint if exists no_label_length;
alter table public.markets add constraint no_label_length
  check (no_label is null or char_length(no_label) between 1 and 20);

-- ----------------------------------------------------------------------------
-- Check
-- ----------------------------------------------------------------------------

select title, yes_label, no_label from public.markets order by created_at desc;

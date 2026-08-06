-- ============================================================================
-- FIX: "permission denied for table users" (Postgres error 42501)
--
-- Postgres has two separate gates in front of every table:
--   1. GRANTs      -- can this role touch the table at all?
--   2. RLS policies -- which rows of it can they see?
-- schema.sql set up the policies but never the grants, so the browser client
-- (role: authenticated / anon) was blocked at gate 1 and never reached the
-- policies. Supabase normally applies these grants automatically, but that
-- only covers tables created by the role its default privileges were defined
-- for -- if the tables were created under a different role, they get skipped.
--
-- Safe to run multiple times.
-- ============================================================================

grant usage on schema public to anon, authenticated;

-- SELECT only, on purpose. Every write in this app (placing a bet, resolving
-- a market, adjusting a balance) goes through a server-side API route using
-- the service role key, which bypasses all of this. Granting INSERT/UPDATE
-- here would let anyone edit their own balance from the browser console.
grant select on public.users to anon, authenticated;
grant select on public.markets to anon, authenticated;
grant select on public.bets to anon, authenticated;

-- Transactions are per-user (the RLS policy filters to your own rows), so
-- signed-out visitors have no reason to read them.
grant select on public.transactions to authenticated;

-- Cover any table added later so this doesn't bite again.
alter default privileges in schema public
  grant select on tables to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Verify: you should see a select row for each table/role pair above.
-- ----------------------------------------------------------------------------
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by table_name, grantee;

-- ============================================================================
-- ADD: admin-editable blurbs for the home page
--
-- Two blocks of text -- how to get credits, and what to do about a forgotten
-- password -- that live in the database rather than in the code, so they can
-- be reworded mid-camp from a phone without a redeploy. The wording of "come
-- find me at the ropes course" is the kind of thing that changes daily.
--
-- Readable by everyone (signed out included -- these are the instructions for
-- people who can't get in). Writable only through the admin API route.
--
-- Safe to run multiple times.
-- ============================================================================

create table if not exists public.site_content (
  key text primary key,
  body text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;

drop policy if exists "site content is viewable by everyone" on public.site_content;
create policy "site content is viewable by everyone"
  on public.site_content for select
  using (true);

grant select on public.site_content to anon, authenticated;
grant all privileges on public.site_content to service_role;

-- Seeded empty; the app shows sensible defaults until you write something.
insert into public.site_content (key, body)
values ('credits_help', ''), ('password_help', '')
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- Check
-- ----------------------------------------------------------------------------

select key, body, updated_at from public.site_content;

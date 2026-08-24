-- ─────────────────────────────────────────────────────────────────────────
-- 001 — Deduplicate price checks by itinerary, and replace the overloaded
--       `active` boolean with an explicit `status`.
--
-- Run this ONCE, in the Supabase SQL editor, as a single transaction.
-- Deploy the matching application code at the same time: this migration
-- removes columns the old code reads, so the app is broken between running
-- it and pushing.
--
-- WHY
--
-- 1. Cost. A search was issued per WATCH. Fifty users watching SEA→LAX on
--    12 Oct in economy meant fifty identical SerpApi calls. After this,
--    price checks belong to an ITINERARY — cost scales with distinct
--    itineraries watched, not with users, which is strongly sub-linear.
--
-- 2. Honesty. `active = false` meant three different things (departure
--    passed / user deleted / user unsubscribed) and afterwards they were
--    indistinguishable. `status` says which.
--
-- Alerts stay keyed to a WATCH, because who gets emailed is still per-user.
-- Evaluation therefore moves to the itinerary grain while delivery and the
-- 24h throttle stay at the watch grain.
-- ─────────────────────────────────────────────────────────────────────────

begin;

-- ── 1. itineraries ───────────────────────────────────────────────────────
create table if not exists itineraries (
  id            uuid primary key default uuid_generate_v4(),
  origin        text not null,
  destination   text not null,
  depart_date   date not null,
  return_date   date,                   -- null = one-way
  cabin_class   text not null default 'economy'
                  check (cabin_class in ('economy','premium_economy','business','first')),
  created_at    timestamptz not null default now()
);

-- A plain UNIQUE constraint would NOT deduplicate one-ways: Postgres treats
-- NULLs as distinct, so every one-way would insert a fresh row. Collapsing
-- null to 'infinity' inside a functional index fixes that on any PG version.
create unique index if not exists itineraries_unique_idx
  on itineraries (origin, destination, depart_date,
                  coalesce(return_date, 'infinity'::date), cabin_class);

alter table itineraries enable row level security;

-- ── 2. watches — new columns ─────────────────────────────────────────────
alter table watches add column if not exists itinerary_id uuid references itineraries(id);

alter table watches add column if not exists status text not null default 'active'
  check (status in ('active','expired','removed','unsubscribed'));

-- ── 3. backfill itineraries from existing watches ────────────────────────
insert into itineraries (origin, destination, depart_date, return_date, cabin_class)
select distinct origin, destination, depart_date, return_date, cabin_class
from watches
on conflict do nothing;

update watches w
set itinerary_id = i.id
from itineraries i
where w.origin = i.origin
  and w.destination = i.destination
  and w.depart_date = i.depart_date
  and coalesce(w.return_date, 'infinity'::date) = coalesce(i.return_date, 'infinity'::date)
  and w.cabin_class = i.cabin_class;

-- Existing `active = false` rows cannot be attributed retroactively —
-- expiry, deletion and unsubscribe all looked identical. 'removed' is the
-- honest label for "deactivated, reason unknown".
update watches set status = case when active then 'active' else 'removed' end;

alter table watches alter column itinerary_id set not null;

-- ── 4. price_checks — repoint from watch to itinerary ────────────────────
alter table price_checks add column if not exists itinerary_id uuid references itineraries(id);

update price_checks pc
set itinerary_id = w.itinerary_id
from watches w
where w.id = pc.watch_id;

-- Any check whose watch was hard-deleted has nothing to attach to.
delete from price_checks where itinerary_id is null;

alter table price_checks alter column itinerary_id set not null;

-- ── 5. drop the old shape ────────────────────────────────────────────────
-- The view MUST go first. It selects price_checks.watch_id, and Postgres
-- refuses to drop a column another object depends on:
--   ERROR 2BP01: cannot drop column watch_id ... view latest_prices depends
-- It is recreated against itinerary_id in section 9.
drop view if exists latest_prices;

drop policy if exists "Users can read price_checks for their watches" on price_checks;

alter table price_checks drop column if exists watch_id;

alter table watches drop column if exists active;
alter table watches drop column if exists origin;
alter table watches drop column if exists destination;
alter table watches drop column if exists depart_date;
alter table watches drop column if exists return_date;
alter table watches drop column if exists cabin_class;

-- ── 6. policies for the new shape ────────────────────────────────────────
-- See the SECURITY MODEL header in schema.sql: no insert policies. The cron
-- writes with the service-role key, which bypasses RLS. Itineraries are
-- created through find_or_create_itinerary() below, not by direct insert.

create policy "Users can read itineraries they watch"
  on itineraries for select
  using (
    exists (
      select 1 from watches w
      where w.itinerary_id = itineraries.id
        and w.user_id = auth.uid()
    )
  );

create policy "Users can read price_checks for itineraries they watch"
  on price_checks for select
  using (
    exists (
      select 1 from watches w
      where w.itinerary_id = price_checks.itinerary_id
        and w.user_id = auth.uid()
    )
  );

-- ── 7. find-or-create, without granting blanket insert ───────────────────
-- Creating a watch needs an itinerary row, but granting users INSERT on
-- itineraries would let anyone write arbitrary rows. A SECURITY DEFINER
-- function keeps the privilege inside one audited operation, and handles
-- the race where two users create the same itinerary at once.
create or replace function find_or_create_itinerary(
  p_origin      text,
  p_destination text,
  p_depart_date date,
  p_return_date date,
  p_cabin_class text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from itineraries
   where origin = p_origin
     and destination = p_destination
     and depart_date = p_depart_date
     and coalesce(return_date, 'infinity'::date) = coalesce(p_return_date, 'infinity'::date)
     and cabin_class = p_cabin_class;

  if v_id is not null then
    return v_id;
  end if;

  insert into itineraries (origin, destination, depart_date, return_date, cabin_class)
  values (p_origin, p_destination, p_depart_date, p_return_date, p_cabin_class)
  returning id into v_id;

  return v_id;

exception when unique_violation then
  -- Another transaction inserted it between our select and insert.
  select id into v_id from itineraries
   where origin = p_origin
     and destination = p_destination
     and depart_date = p_depart_date
     and coalesce(return_date, 'infinity'::date) = coalesce(p_return_date, 'infinity'::date)
     and cabin_class = p_cabin_class;
  return v_id;
end;
$$;

revoke all on function find_or_create_itinerary(text,text,date,date,text) from public;
grant execute on function find_or_create_itinerary(text,text,date,date,text) to authenticated;

-- ── 8. indexes ───────────────────────────────────────────────────────────
drop index if exists idx_watches_active;
drop index if exists idx_price_checks_watch_checked;

create index if not exists idx_watches_user_id      on watches(user_id);
create index if not exists idx_watches_itinerary    on watches(itinerary_id);
create index if not exists idx_watches_status       on watches(status) where status = 'active';
create index if not exists idx_price_checks_itin    on price_checks(itinerary_id, checked_at desc);
create index if not exists idx_alerts_watch_id      on alerts(watch_id);

-- ── 9. view ──────────────────────────────────────────────────────────────
drop view if exists latest_prices;

create view latest_prices
  with (security_invoker = on)
  as
  select distinct on (itinerary_id)
    itinerary_id,
    cash_price,
    cash_currency,
    miles_price,
    checked_at
  from price_checks
  order by itinerary_id, checked_at desc;

commit;

-- ── Verify ───────────────────────────────────────────────────────────────
-- select count(*) from itineraries;                    -- 1 expected
-- select status, count(*) from watches group by 1;     -- all 'active'
-- select count(*) from price_checks
--   where itinerary_id is null;                        -- 0 expected
-- select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' order by tablename;    -- 4 policies, all SELECT

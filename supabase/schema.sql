-- AS Price Watcher — Supabase schema (canonical, post-migration 001)
--
-- For a FRESH database, run this file.
-- For an EXISTING one, run supabase/migrations/001_itineraries_and_status.sql
-- instead — this file describes the destination, not the path.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY MODEL — read before adding policies
-- ─────────────────────────────────────────────────────────────────────────
-- The anon key is PUBLIC. It ships in the browser bundle, so anyone can call
-- Supabase's REST API directly with it. RLS policies are therefore the ONLY
-- boundary protecting this data — not the app, not the API routes.
--
-- The service_role key (used by the cron) BYPASSES RLS entirely. Writes
-- performed by the cron need NO insert policy. If you find yourself adding a
-- policy "so the cron can write", stop: the cron already can, and the policy
-- you are about to add will grant that access to the public instead.
--
-- Naming a policy "Service role can ..." does NOT restrict it to that role.
-- Restriction requires an explicit `to service_role` clause. An earlier
-- version had `for insert with check (true)` on price_checks and alerts,
-- which let ANY anonymous caller write rows. Fixed 2026-08-21.
--
-- Users never insert into `itineraries` directly either — that goes through
-- find_or_create_itinerary(), a SECURITY DEFINER function, so the privilege
-- stays inside one audited operation.
-- ─────────────────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- Itineraries — a priceable journey, independent of who watches it
-- ─────────────────────────────────────────────
-- This table is why cost does not scale with user count. N users watching
-- the same trip share one row, and therefore one price check per run.
create table if not exists itineraries (
  id            uuid primary key default uuid_generate_v4(),
  origin        text not null,          -- IATA, e.g. SEA
  destination   text not null,
  depart_date   date not null,
  return_date   date,                   -- null = one-way (no trip_type column)
  cabin_class   text not null default 'economy'
                  check (cabin_class in ('economy','premium_economy','business','first')),
  created_at    timestamptz not null default now()
);

-- A plain UNIQUE would NOT deduplicate one-ways: Postgres treats NULLs as
-- distinct, so every one-way would insert a fresh row. Collapsing null to
-- 'infinity' in a functional index fixes that on any PG version.
create unique index if not exists itineraries_unique_idx
  on itineraries (origin, destination, depart_date,
                  coalesce(return_date, 'infinity'::date), cabin_class);

alter table itineraries enable row level security;

drop policy if exists "Users can read itineraries they watch" on itineraries;
create policy "Users can read itineraries they watch"
  on itineraries for select
  using (
    exists (
      select 1 from watches w
      where w.itinerary_id = itineraries.id
        and w.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- Watches — one user's subscription to an itinerary
-- ─────────────────────────────────────────────
create table if not exists watches (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  itinerary_id  uuid not null references itineraries(id),
  -- Replaces an `active` boolean that meant three different things and,
  -- once false, could not tell you which.
  status        text not null default 'active'
                  check (status in ('active','expired','removed','unsubscribed')),
  created_at    timestamptz not null default now()
);

alter table watches enable row level security;

drop policy if exists "Users can manage their own watches" on watches;
create policy "Users can manage their own watches"
  on watches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Price checks — belong to the ITINERARY, not to any one watcher
-- ─────────────────────────────────────────────
create table if not exists price_checks (
  id               uuid primary key default uuid_generate_v4(),
  itinerary_id     uuid not null references itineraries(id) on delete cascade,
  checked_at       timestamptz not null default now(),
  cash_price       numeric(10,2),       -- null if unavailable
  cash_currency    text not null default 'USD',
  miles_price      integer,             -- null until seats.aero is enabled
  airline          text not null default 'AS',
  flight_number    text,
  duration_minutes integer,
  stops            integer not null default 0
);

alter table price_checks enable row level security;

drop policy if exists "Users can read price_checks for itineraries they watch" on price_checks;
create policy "Users can read price_checks for itineraries they watch"
  on price_checks for select
  using (
    exists (
      select 1 from watches w
      where w.itinerary_id = price_checks.itinerary_id
        and w.user_id = auth.uid()
    )
  );

-- Deliberately NO insert/update/delete policy. Only the cron writes here,
-- with the service_role key, which bypasses RLS. See SECURITY MODEL above.

-- ─────────────────────────────────────────────
-- Alerts — keyed to a WATCH, because delivery is per user
-- ─────────────────────────────────────────────
-- Evaluation happens at the itinerary grain (one price series), but delivery
-- and the 24h throttle are per watch: everyone subscribed to a dropping
-- itinerary gets their own email.
create table if not exists alerts (
  id               uuid primary key default uuid_generate_v4(),
  watch_id         uuid not null references watches(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  triggered_at     timestamptz not null default now(),
  alert_type       text not null check (alert_type in ('drop_10pct','new_low')),
  cash_price       numeric(10,2),
  miles_price      integer,
  prev_cash_price  numeric(10,2),
  prev_miles_price integer,
  email_sent       boolean not null default false
);

alter table alerts enable row level security;

drop policy if exists "Users can read their own alerts" on alerts;
create policy "Users can read their own alerts"
  on alerts for select
  using (auth.uid() = user_id);

-- Deliberately NO insert policy — same reasoning as price_checks.

-- ─────────────────────────────────────────────
-- find_or_create_itinerary
-- ─────────────────────────────────────────────
-- Creating a watch needs an itinerary row, but granting users INSERT on a
-- table shared by everyone is not acceptable. SECURITY DEFINER keeps the
-- privilege inside one operation, and the exception handler resolves the
-- race where two users create the same itinerary simultaneously.
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

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
create index if not exists idx_watches_user_id   on watches(user_id);
create index if not exists idx_watches_itinerary on watches(itinerary_id);
create index if not exists idx_watches_status    on watches(status) where status = 'active';
create index if not exists idx_price_checks_itin on price_checks(itinerary_id, checked_at desc);
create index if not exists idx_alerts_watch_id   on alerts(watch_id);

-- ─────────────────────────────────────────────
-- Convenience view: latest price per itinerary
-- ─────────────────────────────────────────────
-- security_invoker = on makes the view evaluate RLS as the CALLER rather
-- than the view owner. Without it (the Postgres default) it would read
-- price_checks with owner privileges and return every user's rows.
create or replace view latest_prices
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

-- AS Price Watcher — Supabase schema
-- Run this in your Supabase SQL editor.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY MODEL — read before adding policies
-- ─────────────────────────────────────────────────────────────────────────
-- The anon key is PUBLIC. It ships in the browser bundle, so anyone can call
-- Supabase's REST API directly with it. RLS policies are therefore the ONLY
-- boundary protecting this data — not the app, not the API routes.
--
-- The service_role key (used by the cron) BYPASSES RLS entirely. That means
-- writes performed by the cron need NO insert policy. If you find yourself
-- adding a policy "so the cron can write", stop: the cron already can, and
-- the policy you are about to add will grant that access to the public
-- instead.
--
-- Naming a policy "Service role can ..." does NOT restrict it to the service
-- role. Restriction requires an explicit `to service_role` clause. An earlier
-- version of this schema had `for insert with check (true)` on both
-- price_checks and alerts, which allowed ANY anonymous caller to write rows.
-- Fixed 2026-08-21. Do not reintroduce.
-- ─────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─────────────────────────────────────────────
-- Watches
-- ─────────────────────────────────────────────
create table if not exists watches (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  origin        text not null,          -- IATA code, e.g. SEA
  destination   text not null,          -- IATA code, e.g. LAX
  depart_date   date not null,
  return_date   date,                   -- null = one-way
  cabin_class   text not null default 'economy'
                  check (cabin_class in ('economy','premium_economy','business','first')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table watches enable row level security;

-- Owners get full CRUD on their own rows. `with check` is what stops a user
-- inserting or updating a row so that it belongs to someone else.
drop policy if exists "Users can manage their own watches" on watches;
create policy "Users can manage their own watches"
  on watches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- Price checks  (one row per watch per check)
-- ─────────────────────────────────────────────
create table if not exists price_checks (
  id               uuid primary key default uuid_generate_v4(),
  watch_id         uuid not null references watches(id) on delete cascade,
  checked_at       timestamptz not null default now(),
  cash_price       numeric(10,2),       -- lowest fare found, null if unavailable
  cash_currency    text not null default 'USD',
  miles_price      integer,             -- lowest award price in miles, null if unavailable
  airline          text not null default 'AS',
  flight_number    text,
  duration_minutes integer,
  stops            integer not null default 0
);

alter table price_checks enable row level security;

-- Read-only, scoped through the parent watch.
drop policy if exists "Users can read price_checks for their watches" on price_checks;
create policy "Users can read price_checks for their watches"
  on price_checks for select
  using (
    exists (
      select 1 from watches w
      where w.id = price_checks.watch_id
        and w.user_id = auth.uid()
    )
  );

-- Deliberately NO insert/update/delete policy. Only the cron writes here, and
-- it uses the service_role key, which bypasses RLS. Adding an insert policy
-- would open writes to the public. See SECURITY MODEL at the top.
drop policy if exists "Service role can insert price_checks" on price_checks;

-- ─────────────────────────────────────────────
-- Alerts
-- ─────────────────────────────────────────────
create table if not exists alerts (
  id               uuid primary key default uuid_generate_v4(),
  watch_id         uuid not null references watches(id) on delete cascade,
  user_id          uuid not null references auth.users(id) on delete cascade,
  triggered_at     timestamptz not null default now(),
  alert_type       text not null
                     check (alert_type in ('drop_10pct', 'new_low')),
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

-- Deliberately NO insert policy — same reasoning as price_checks above.
drop policy if exists "Service role can insert alerts" on alerts;

-- ─────────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────────
create index if not exists idx_watches_user_id on watches(user_id);
create index if not exists idx_watches_active   on watches(active) where active = true;
create index if not exists idx_price_checks_watch_checked
  on price_checks(watch_id, checked_at desc);
create index if not exists idx_alerts_watch_id on alerts(watch_id);

-- ─────────────────────────────────────────────
-- Convenience view: latest price per watch
-- ─────────────────────────────────────────────
-- security_invoker = on makes the view evaluate RLS as the CALLER rather than
-- as the view owner. Without it (the Postgres default) the view reads
-- price_checks with owner privileges and returns every user's rows,
-- regardless of the select policy above.
create or replace view latest_prices
  with (security_invoker = on)
  as
  select distinct on (watch_id)
    watch_id,
    cash_price,
    cash_currency,
    miles_price,
    checked_at
  from price_checks
  order by watch_id, checked_at desc;

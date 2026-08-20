-- AS Price Watcher — Supabase schema
-- Run this in your Supabase SQL editor

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

-- Users can read price_checks for their own watches
create policy "Users can read price_checks for their watches"
  on price_checks for select
  using (
    exists (
      select 1 from watches w
      where w.id = price_checks.watch_id
        and w.user_id = auth.uid()
    )
  );

-- Service role (cron) can insert
create policy "Service role can insert price_checks"
  on price_checks for insert
  with check (true);

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

create policy "Users can read their own alerts"
  on alerts for select
  using (auth.uid() = user_id);

create policy "Service role can insert alerts"
  on alerts for insert
  with check (true);

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
create or replace view latest_prices as
  select distinct on (watch_id)
    watch_id,
    cash_price,
    cash_currency,
    miles_price,
    checked_at
  from price_checks
  order by watch_id, checked_at desc;

-- AS Price Watcher — Supabase schema (canonical, current through migration 010)
--
-- For a FRESH database, run this file.
-- For an EXISTING one, run the files in supabase/migrations/ in order
-- instead — this file describes the destination, not the path.
--
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY MODEL — read before adding policies
-- ─────────────────────────────────────────────────────────────────────────
-- The anon key is PUBLIC. It ships in the browser bundle, so anyone can call
-- Supabase's REST API directly with it. So the database itself is the
-- boundary protecting this data — not the app, not the API routes. It has
-- two layers (since migration 007, 2026-10-20):
--   1. GRANTS decide which OPERATIONS a role can attempt at all. anon
--      (logged out) has none; authenticated has exactly what the app uses
--      (see GRANTS at the bottom). Everything else is refused before RLS
--      is even consulted.
--   2. RLS policies decide WHICH ROWS a permitted operation can touch.
-- A mistake in one layer is caught by the other. Before migration 007 every
-- API role held every privilege and RLS was the only layer.
--
-- NEW TABLES AND FUNCTIONS GET NO ACCESS BY DEFAULT. Default privileges for
-- objects created by `postgres` were revoked in 007 (and Supabase stops
-- auto-granting new tables anyway from 2026-10-30). Every migration that
-- creates a table, view or function must grant exactly what the app needs
-- — and only service_role gets anything automatically.
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

-- Default privileges first, so nothing created below is ever auto-granted
-- to the API roles. (EXECUTE-to-PUBLIC is Postgres's own built-in default
-- and can only be removed globally, not per schema.)
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
alter default privileges for role postgres
  revoke execute on functions from public;

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
  -- Stop limit (migration 006): null = any, 0 = nonstop only, 1/2 = up to
  -- that many stops. Part of the identity: a nonstop-only watch and an
  -- any-stops watch are different searches and must not share history.
  max_stops     smallint
                  constraint itineraries_max_stops_check
                  check (max_stops is null or max_stops between 0 and 2),
  -- What the tracked price means (migration 010): 'alaska_only' = an
  -- all-Alaska trip (every watch created from 2026-10-22); 'alaska_leg' =
  -- the legacy pick, cheapest itinerary with ANY Alaska leg (on a round
  -- trip the return can be another airline). Part of the identity.
  fare_scope    text not null default 'alaska_leg'
                  constraint itineraries_fare_scope_check
                  check (fare_scope in ('alaska_leg', 'alaska_only')),
  created_at    timestamptz not null default now()
);

-- A plain UNIQUE would NOT deduplicate one-ways: Postgres treats NULLs as
-- distinct, so every one-way would insert a fresh row. Collapsing null to
-- 'infinity' in a functional index fixes that on any PG version.
-- max_stops folded the same way (null → -1) so two any-stops rows collide.
create unique index if not exists itineraries_unique_idx
  on itineraries (origin, destination, depart_date,
                  coalesce(return_date, 'infinity'::date), cabin_class,
                  coalesce(max_stops, -1), fare_scope);

alter table itineraries enable row level security;

-- Its read policy is created after the watches table below — it refers to
-- watches, and Postgres rejects a policy naming a table that doesn't exist
-- yet (this file failed on a fresh database until 2026-10-20).

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
  created_at    timestamptz not null default now(),
  -- Set automatically by a trigger below, not by application code — see
  -- supabase/migrations/003_watch_status_changed_at.sql for why.
  status_changed_at timestamptz not null default now()
);

alter table watches enable row level security;

drop policy if exists "Users can manage their own watches" on watches;
create policy "Users can manage their own watches"
  on watches for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

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

-- Keeps status_changed_at correct regardless of which code path changes
-- status (soft-delete, unsubscribe, the cron's expiry path, or anything
-- added later) — see migration 003's header comment.
create or replace function set_watch_status_changed_at() returns trigger
language plpgsql
set search_path = ''  -- migration 008; body needs only NEW/OLD and now()
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_watches_status_changed_at on watches;
create trigger trg_watches_status_changed_at
  before update on watches
  for each row
  execute function set_watch_status_changed_at();

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
  stops            integer not null default 0,
  -- Cheapest fare on ANY airline in the same search, when it beats the
  -- tracked Alaska fare (migration 004). Free: the provider already fetches
  -- every carrier and filters to Alaska in our own code. Not used by
  -- lib/alerts.ts — alerts stay about the Alaska price.
  competitor_cash_price numeric(10,2),
  competitor_airline    text,
  -- Every OUTBOUND leg of the tracked itinerary, in order (migration 005):
  -- [{"flight": "LO412", "from": "ZRH", "to": "WAW"}, ...]. Lets the UI show
  -- which leg is Alaska on multi-carrier routings. Null on older rows.
  legs                  jsonb,
  -- What THIS price was (migration 010): 'alaska_only', 'alaska_leg', or
  -- 'any_airline' (no Alaska itinerary). An alaska_only itinerary records
  -- 'alaska_leg' on a day no all-Alaska trip existed. Null on older rows.
  fare_scope            text
                  constraint price_checks_fare_scope_check
                  check (fare_scope is null or fare_scope in ('alaska_only', 'alaska_leg', 'any_airline'))
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
  alert_type       text not null check (alert_type in ('drop_10pct','new_low','cumulative_drop')),
  cash_price       numeric(10,2),
  miles_price      integer,
  prev_cash_price  numeric(10,2),
  prev_miles_price integer,
  email_sent       boolean not null default false,
  -- What the alert was measured against (lib/alerts.ts baseline*):
  -- 7-day average / previous low / last-reported price. Migration 009.
  -- prev_* above is just the previous check and can mislead.
  baseline_cash_price  numeric(10,2),
  baseline_miles_price numeric(12,2)
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
  p_cabin_class text,
  p_max_stops   integer default null,
  p_fare_scope  text    default 'alaska_leg'   -- migration 010; new watches pass 'alaska_only'
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
     and cabin_class = p_cabin_class
     and coalesce(max_stops, -1) = coalesce(p_max_stops, -1)
     and fare_scope = p_fare_scope;

  if v_id is not null then
    return v_id;
  end if;

  insert into itineraries (origin, destination, depart_date, return_date, cabin_class, max_stops, fare_scope)
  values (p_origin, p_destination, p_depart_date, p_return_date, p_cabin_class, p_max_stops, p_fare_scope)
  returning id into v_id;

  return v_id;

exception when unique_violation then
  select id into v_id from itineraries
   where origin = p_origin
     and destination = p_destination
     and depart_date = p_depart_date
     and coalesce(return_date, 'infinity'::date) = coalesce(p_return_date, 'infinity'::date)
     and cabin_class = p_cabin_class
     and coalesce(max_stops, -1) = coalesce(p_max_stops, -1)
     and fare_scope = p_fare_scope;
  return v_id;
end;
$$;

-- Revoke from anon EXPLICITLY, not just public: Supabase grants EXECUTE on
-- new functions to anon/authenticated/service_role directly, so revoking
-- from public alone left logged-out callers able to run this SECURITY
-- DEFINER function (found live 2026-09-24, fixed in migration 006).
revoke all on function find_or_create_itinerary(text,text,date,date,text,integer,text) from public, anon;
grant execute on function find_or_create_itinerary(text,text,date,date,text,integer,text) to authenticated, service_role;

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

-- ─────────────────────────────────────────────
-- GRANTS — layer 1 of the security model (see top)
-- ─────────────────────────────────────────────
-- Exactly what the app uses, from an audit of every .from()/.rpc() in web
-- and mobile (migration 007's header has the list). Logged-in users read
-- their data and create/remove watches; removal is a status UPDATE, so
-- there is deliberately no DELETE. Every write to price_checks and alerts
-- uses service_role. latest_prices is unused by the app, so no API access.
-- Explicit revokes too, because Supabase-provisioned projects may still
-- hold the old broad grants from before these defaults were changed.
revoke all on table itineraries, watches, price_checks, alerts, latest_prices
  from anon, authenticated;
grant select on table itineraries, price_checks, alerts to authenticated;
grant select, insert, update on table watches to authenticated;
grant all on table itineraries, watches, price_checks, alerts, latest_prices
  to service_role;

-- Trigger function: fires regardless of the caller's EXECUTE privilege
-- (checked only when the trigger is created), so nobody needs to call it.
revoke all on function set_watch_status_changed_at() from public, anon, authenticated;

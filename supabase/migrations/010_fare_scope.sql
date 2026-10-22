-- Track all-Alaska round trips for new watches (user's choice 2026-10-22).
--
-- What the app called "the Alaska price" was the cheapest itinerary with
-- ANY Alaska leg. The provider only sees outbound flights on a round trip,
-- so the return half could be anyone: SEA→TPA's "$688 Alaska" was AS 326
-- out and Delta DL 1090 back (confirmed on Google Flights 10/22), while an
-- all-Alaska round trip — what alaskaair.com sells — was $854–932.
--
-- itineraries.fare_scope says which kind of price an itinerary tracks:
--   'alaska_leg'  — the legacy pick. EVERY existing row gets this, so
--                   existing watches keep behaving exactly as before.
--   'alaska_only' — SerpApi include_airlines=AS. New watches.
-- It changes WHAT is searched, so it's part of the itinerary's identity
-- (same reasoning as max_stops in 006): an all-Alaska watch and a legacy
-- watch on the same route and dates are different series and must not
-- share a price history.
--
-- price_checks.fare_scope records what each STORED price actually was —
-- 'alaska_only', 'alaska_leg', or 'any_airline' (no Alaska itinerary at
-- all) — because an alaska_only itinerary falls back to the legacy pick on
-- a day no all-Alaska trip exists. Null on older rows.
--
-- ORDER: safe to apply BEFORE the code ships. The deployed code calls
-- find_or_create_itinerary with six named arguments; p_fare_scope defaults
-- to 'alaska_leg', so that call keeps resolving to legacy itineraries until
-- the new code passes 'alaska_only' explicitly.
--
-- GRANTS: since 007, a new function gets no EXECUTE for the API roles by
-- default — so it's granted explicitly below, as 006 did. New columns on
-- existing tables follow the tables' grants.

begin;

alter table itineraries
  add column if not exists fare_scope text not null default 'alaska_leg';
alter table itineraries
  drop constraint if exists itineraries_fare_scope_check;
alter table itineraries
  add constraint itineraries_fare_scope_check
  check (fare_scope in ('alaska_leg', 'alaska_only'));

drop index if exists itineraries_unique_idx;
create unique index itineraries_unique_idx on itineraries (
  origin,
  destination,
  depart_date,
  coalesce(return_date, 'infinity'::date),
  cabin_class,
  coalesce(max_stops, -1),
  fare_scope
);

alter table price_checks
  add column if not exists fare_scope text;
alter table price_checks
  drop constraint if exists price_checks_fare_scope_check;
alter table price_checks
  add constraint price_checks_fare_scope_check
  check (fare_scope is null or fare_scope in ('alaska_only', 'alaska_leg', 'any_airline'));

drop function if exists find_or_create_itinerary(text, text, date, date, text, integer);

create function find_or_create_itinerary(
  p_origin       text,
  p_destination  text,
  p_depart_date  date,
  p_return_date  date,
  p_cabin_class  text,
  p_max_stops    integer default null,
  p_fare_scope   text    default 'alaska_leg'
)
returns uuid
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
  -- Another transaction inserted it between our select and insert.
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

revoke all on function find_or_create_itinerary(text, text, date, date, text, integer, text)
  from public, anon;
grant execute on function find_or_create_itinerary(text, text, date, date, text, integer, text)
  to authenticated, service_role;

commit;

-- Make PostgREST pick up the new signature immediately.
notify pgrst, 'reload schema';

-- Verify:
-- select fare_scope, count(*) from itineraries group by 1;
-- select oid::regprocedure, proacl from pg_proc where proname = 'find_or_create_itinerary';

-- Optionally skip Alaska "Saver" (basic economy) fares (user's request
-- 2026-11-25).
--
-- itineraries.exclude_basic: true = price only fares that include seat
-- selection and a carry-on (Main or better). Sent to SerpApi as
-- exclude_basic=true on every search for the itinerary. SerpApi documents
-- it for US domestic economy only, so the API accepts it only there.
--
-- Measured 11/25 (Claude outputs/saver-test.mjs, 4 searches), SEA→LAS
-- 3/15 one-way: AS 96 + AS 2018 $224 → $274; cheapest all-Alaska $214 →
-- $264; and the all-Alaska search's price_insights history follows the
-- filter (last point $264 = lowest = cheapest returned), so the Google
-- head start stays valid for these itineraries.
--
-- It changes WHAT is priced, so it is part of the itinerary's identity
-- (like max_stops 006, fare_scope 010, pinned flights 012): a trip with and
-- without Saver are separate itineraries with separate histories. Every
-- existing row is false.
--
-- ORDER: safe to apply BEFORE the code ships. Deployed code calls
-- find_or_create_itinerary with at most nine named arguments; the new one
-- defaults to false, so those calls keep resolving to the same rows.
--
-- Contains DROP INDEX / DROP FUNCTION (both recreated right after): run it
-- in the Supabase SQL editor (the connector can't run destructive SQL).
--
-- GRANTS: new function → explicit EXECUTE grant (default privileges grant
-- the API roles nothing since 007). The new column follows the table's.

begin;

alter table itineraries
  add column if not exists exclude_basic boolean not null default false;

drop index if exists itineraries_unique_idx;
create unique index itineraries_unique_idx on itineraries (
  origin,
  destination,
  depart_date,
  coalesce(return_date, 'infinity'::date),
  cabin_class,
  coalesce(max_stops, -1),
  fare_scope,
  coalesce(outbound_flights, '{}'::text[]),
  coalesce(return_flights, '{}'::text[]),
  exclude_basic
);

drop function if exists find_or_create_itinerary(text, text, date, date, text, integer, text, text[], text[]);

create function find_or_create_itinerary(
  p_origin           text,
  p_destination      text,
  p_depart_date      date,
  p_return_date      date,
  p_cabin_class      text,
  p_max_stops        integer default null,
  p_fare_scope       text    default 'alaska_leg',
  p_outbound_flights text[]  default null,
  p_return_flights   text[]  default null,
  p_exclude_basic    boolean default false
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
     and fare_scope = p_fare_scope
     and coalesce(outbound_flights, '{}'::text[]) = coalesce(p_outbound_flights, '{}'::text[])
     and coalesce(return_flights, '{}'::text[]) = coalesce(p_return_flights, '{}'::text[])
     and exclude_basic = coalesce(p_exclude_basic, false);

  if v_id is not null then
    return v_id;
  end if;

  insert into itineraries (origin, destination, depart_date, return_date, cabin_class, max_stops, fare_scope, outbound_flights, return_flights, exclude_basic)
  values (p_origin, p_destination, p_depart_date, p_return_date, p_cabin_class, p_max_stops, p_fare_scope, p_outbound_flights, p_return_flights, coalesce(p_exclude_basic, false))
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
     and fare_scope = p_fare_scope
     and coalesce(outbound_flights, '{}'::text[]) = coalesce(p_outbound_flights, '{}'::text[])
     and coalesce(return_flights, '{}'::text[]) = coalesce(p_return_flights, '{}'::text[])
     and exclude_basic = coalesce(p_exclude_basic, false);
  return v_id;
end;
$$;

revoke all on function find_or_create_itinerary(text, text, date, date, text, integer, text, text[], text[], boolean)
  from public, anon;
grant execute on function find_or_create_itinerary(text, text, date, date, text, integer, text, text[], text[], boolean)
  to authenticated, service_role;

commit;

-- Make PostgREST pick up the new signature immediately.
notify pgrst, 'reload schema';

-- Verify:
-- select oid::regprocedure, proacl from pg_proc where proname = 'find_or_create_itinerary';
-- select count(*) filter (where exclude_basic) from itineraries;

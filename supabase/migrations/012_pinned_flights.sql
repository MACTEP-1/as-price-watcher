-- Let a watch follow specific flights (user's request 2026-10-23).
--
-- itineraries.outbound_flights / return_flights: the exact flight numbers
-- to price, in order, as SerpApi writes them without the space — e.g.
-- {AS326}, or {AS623,AS625} for a connection. NULL = not pinned (every
-- existing row): the provider picks the cheapest trip as before.
--
-- How they're priced (lib/flights/serpapi-provider.ts): one unfiltered
-- search, find the itinerary whose outbound flights match exactly; for a
-- pinned return, a second call with that itinerary's departure_token lists
-- the returns with exact round-trip prices, and the matching one is the
-- price. So a pinned round trip costs 2 searches a day, a pinned outbound
-- alone (or a one-way) costs 1. If the pinned flight isn't on sale that
-- day, the check stores no price rather than a different flight's.
--
-- They change WHAT is priced, so both are part of the itinerary's identity
-- (like max_stops in 006 and fare_scope in 010). NULL is folded to an
-- empty array in the unique index so two unpinned rows collide.
--
-- ORDER: safe to apply BEFORE the code ships. Deployed code calls
-- find_or_create_itinerary with at most seven named arguments; the two new
-- ones default to NULL, so those calls keep resolving to unpinned rows.
--
-- Contains DROP INDEX / DROP FUNCTION (both recreated right after), so run
-- it in the Supabase SQL editor — the connector waits on an approval that
-- never surfaces for destructive SQL (see migration 010's history).
--
-- GRANTS: new function → explicit EXECUTE grant (default privileges grant
-- the API roles nothing since 007). New columns follow the table's grants.

begin;

alter table itineraries
  add column if not exists outbound_flights text[],
  add column if not exists return_flights   text[];

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
  coalesce(return_flights, '{}'::text[])
);

drop function if exists find_or_create_itinerary(text, text, date, date, text, integer, text);

create function find_or_create_itinerary(
  p_origin           text,
  p_destination      text,
  p_depart_date      date,
  p_return_date      date,
  p_cabin_class      text,
  p_max_stops        integer default null,
  p_fare_scope       text    default 'alaska_leg',
  p_outbound_flights text[]  default null,
  p_return_flights   text[]  default null
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
     and coalesce(return_flights, '{}'::text[]) = coalesce(p_return_flights, '{}'::text[]);

  if v_id is not null then
    return v_id;
  end if;

  insert into itineraries (origin, destination, depart_date, return_date, cabin_class, max_stops, fare_scope, outbound_flights, return_flights)
  values (p_origin, p_destination, p_depart_date, p_return_date, p_cabin_class, p_max_stops, p_fare_scope, p_outbound_flights, p_return_flights)
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
     and coalesce(return_flights, '{}'::text[]) = coalesce(p_return_flights, '{}'::text[]);
  return v_id;
end;
$$;

revoke all on function find_or_create_itinerary(text, text, date, date, text, integer, text, text[], text[])
  from public, anon;
grant execute on function find_or_create_itinerary(text, text, date, date, text, integer, text, text[], text[])
  to authenticated, service_role;

commit;

-- Make PostgREST pick up the new signature immediately.
notify pgrst, 'reload schema';

-- Verify:
-- select oid::regprocedure, proacl from pg_proc where proname = 'find_or_create_itinerary';
-- select count(*) filter (where outbound_flights is not null) from itineraries;

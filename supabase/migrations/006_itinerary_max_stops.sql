-- Lets a watch limit the number of stops ("nonstop only", "up to 1 stop").
--
-- The limit changes WHAT is searched, so it is part of an itinerary's
-- identity, not a per-user preference: a nonstop-only watch and an
-- any-stops watch on the same route and dates are different searches and
-- must not share a price history. Hence a column on itineraries, the unique
-- index extended to include it, and find_or_create_itinerary taught it.
--
-- max_stops: NULL = any number of stops (every existing row — unchanged),
-- 0 = nonstop only, 1 = up to 1 stop, 2 = up to 2 stops. Maps onto
-- SerpApi's `stops` parameter as max_stops + 1 (its 0 means "any").
--
-- When the limit and "Alaska" can't both be met (ZRH->SEA nonstop: no
-- itinerary with an Alaska leg), the provider falls back to the cheapest
-- matching itinerary on any airline, exactly as it already does for a route
-- with no Alaska service — and since 005 the card says "no Alaska leg".
-- Chosen by the user 09/24 over tracking nothing.
--
-- ALSO FIXES A GRANT GAP found while reading the live function 09/24:
-- schema.sql's `revoke all ... from public` never removed `anon`, because
-- Supabase grants EXECUTE on new functions to anon/authenticated/
-- service_role DIRECTLY, not via PUBLIC. So a logged-out caller holding the
-- public anon key could run this SECURITY DEFINER function and insert
-- itinerary rows. Low impact (the cron only checks itineraries with an
-- active watch, and creating a watch needs login), but not what was
-- intended. The new function revokes anon explicitly.
--
-- ORDER: safe to run BEFORE the code ships. The deployed code calls this
-- with five NAMED arguments; p_max_stops has a default, so that call still
-- resolves to the new function unchanged.

begin;

alter table itineraries
  add column if not exists max_stops smallint;

alter table itineraries
  drop constraint if exists itineraries_max_stops_check;
alter table itineraries
  add constraint itineraries_max_stops_check
  check (max_stops is null or max_stops between 0 and 2);

-- Same shape as before plus the stop limit; NULL folded to -1 so two
-- any-stops rows still collide (NULLs never compare equal in an index).
drop index if exists itineraries_unique_idx;
create unique index itineraries_unique_idx on itineraries (
  origin,
  destination,
  depart_date,
  coalesce(return_date, 'infinity'::date),
  cabin_class,
  coalesce(max_stops, -1)
);

-- A new argument list is a new function in Postgres, so drop the old one
-- rather than leave an ambiguous overload behind.
drop function if exists find_or_create_itinerary(text, text, date, date, text);

create function find_or_create_itinerary(
  p_origin       text,
  p_destination  text,
  p_depart_date  date,
  p_return_date  date,
  p_cabin_class  text,
  p_max_stops    integer default null
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
     and coalesce(max_stops, -1) = coalesce(p_max_stops, -1);

  if v_id is not null then
    return v_id;
  end if;

  insert into itineraries (origin, destination, depart_date, return_date, cabin_class, max_stops)
  values (p_origin, p_destination, p_depart_date, p_return_date, p_cabin_class, p_max_stops)
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
     and coalesce(max_stops, -1) = coalesce(p_max_stops, -1);
  return v_id;
end;
$$;

-- Explicit on BOTH sides: revoking from public alone left anon's direct
-- grant in place (see header).
revoke all on function find_or_create_itinerary(text, text, date, date, text, integer)
  from public, anon;
grant execute on function find_or_create_itinerary(text, text, date, date, text, integer)
  to authenticated, service_role;

commit;

-- Make PostgREST pick up the new signature immediately.
notify pgrst, 'reload schema';

-- Verify:
-- select oid::regprocedure from pg_proc where proname = 'find_or_create_itinerary';
-- select grantee, privilege_type from information_schema.routine_privileges
--  where routine_name = 'find_or_create_itinerary';

-- Dry run of account deletion against the REAL schema — changes nothing.
--
-- Paste into the Supabase SQL editor and run. It creates a throwaway user
-- with two trips, deletes that user the way auth.admin.deleteUser does at
-- the database level, runs lib/account.ts's cleanup as service_role, then
-- RAISES an error carrying the results — the raise rolls everything back,
-- so the "error" IS the report. Expected:
--   user_watches=0 user_alerts=0 orphan_itin=0 orphan_checks=0
--   shared_itin=1 shared_checks=1 real_user_watches = before + 1
-- (+1 is the test's own watch on the shared trip, also rolled back).
do $$
declare
  u uuid := gen_random_uuid();
  real_user uuid := (select id from auth.users where id <> u order by created_at limit 1);
  it_mine uuid; it_shared uuid; w1 uuid;
  n_real_w_before int := (select count(*) from watches where user_id = real_user);
begin
  insert into auth.users (id, aud, role, email, created_at, updated_at)
    values (u, 'authenticated', 'authenticated', 'deletion-test@example.invalid', now(), now());
  insert into itineraries (origin, destination, depart_date, cabin_class, fare_scope)
    values ('ZZA', 'ZZB', '2027-06-01', 'economy', 'alaska_only') returning id into it_mine;
  insert into itineraries (origin, destination, depart_date, cabin_class, fare_scope)
    values ('ZZC', 'ZZD', '2027-06-01', 'economy', 'alaska_only') returning id into it_shared;
  insert into watches (user_id, itinerary_id) values (u, it_mine) returning id into w1;
  insert into watches (user_id, itinerary_id, status) values (u, it_mine, 'removed');
  insert into watches (user_id, itinerary_id) values (u, it_shared);
  insert into watches (user_id, itinerary_id) values (real_user, it_shared);
  insert into price_checks (itinerary_id, cash_price) values (it_mine, 100), (it_mine, 110), (it_shared, 200);
  insert into alerts (watch_id, user_id, alert_type, cash_price) values (w1, u, 'new_low', 100);

  -- What auth.admin.deleteUser does in the database.
  delete from auth.users where id = u;

  -- lib/account.ts step 3, with the same role the API uses.
  set local role service_role;
  delete from price_checks where itinerary_id in (
    select unnest(array[it_mine, it_shared])
    except select itinerary_id from watches where itinerary_id in (it_mine, it_shared));
  delete from itineraries where id in (
    select unnest(array[it_mine, it_shared])
    except select itinerary_id from watches where itinerary_id in (it_mine, it_shared));
  reset role;

  raise exception 'RESULT user_watches=% user_alerts=% orphan_itin=% orphan_checks=% shared_itin=% shared_checks=% real_user_watches=% (before %)',
    (select count(*) from watches where user_id = u),
    (select count(*) from alerts where user_id = u),
    (select count(*) from itineraries where id = it_mine),
    (select count(*) from price_checks where itinerary_id = it_mine),
    (select count(*) from itineraries where id = it_shared),
    (select count(*) from price_checks where itinerary_id = it_shared),
    (select count(*) from watches where user_id = real_user),
    n_real_w_before;
end $$;

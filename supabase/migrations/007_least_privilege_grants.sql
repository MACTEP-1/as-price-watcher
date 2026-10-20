-- Least-privilege grants: a second layer behind RLS.
--
-- Until now every table, the latest_prices view and every function granted
-- EVERYTHING to anon (logged out) and authenticated (logged in) — Supabase's
-- old automatic grant — so RLS was the only barrier. One mistaken policy and
-- logged-out requests would reach data. (Both RLS bugs found on 2026-08-21
-- were exactly that kind of mistake; see the project's security-rls-audit
-- doc.) Prompted by Supabase ending automatic grants for new tables on
-- 2026-10-30; chosen by the user over just mirroring the old broad grants.
--
-- WHAT THE APP ACTUALLY USES — audited 2026-10-20, every .from()/.rpc() in
-- web and mobile. Logged-in users (web server pages, API routes acting for
-- the user, and the mobile app via the shared lib/watches.ts):
--   watches        SELECT, INSERT (create), UPDATE (remove = status update)
--   itineraries    SELECT (embedded in the watches query)
--   price_checks   SELECT (incl. the count at watch creation)
--   alerts         SELECT
--   find_or_create_itinerary  EXECUTE
-- Nothing deletes, upserts, uses realtime or storage. Every write to
-- price_checks/alerts — the cron, the first check at watch creation, the
-- unsubscribe link — uses the service role. Logged-out visitors never touch
-- a table: every page and route requires login except the cron and
-- unsubscribe, which use the service role.
--
-- So: anon gets nothing; authenticated gets exactly the list above (note:
-- NO delete on watches — nothing deletes; removal is a soft status change);
-- service_role keeps everything. RLS policies are untouched and still
-- decide WHICH rows; these grants decide which operations are possible at
-- all. Also removes TRUNCATE/TRIGGER/REFERENCES from the API roles, which
-- RLS never governed.
--
-- DEFAULT PRIVILEGES (the root cause of the 006 gap): Supabase's defaults
-- grant every NEW table, sequence and function created by `postgres` in
-- public to anon and authenticated. 006 fixed one function; the next one
-- created would have been exposed again (set_watch_status_changed_at, from
-- 003, already was — harmless only because a trigger function can't be
-- called directly). Revoked for objects created by `postgres` — the role
-- migrations run as. From here on, any new table or function needs explicit
-- grants in the migration that creates it, which is also what Supabase
-- requires for tables from 2026-10-30. (Defaults for objects created by
-- supabase_admin can't be changed from here, and our migrations never run
-- as it.)
--
-- ROLLBACK, if a screen turns out to need something the audit missed —
-- restores the previous broad grants exactly:
--   grant all on table itineraries, watches, price_checks, alerts, latest_prices
--     to anon, authenticated;
--   grant execute on function set_watch_status_changed_at() to public, anon, authenticated;
--   alter default privileges for role postgres in schema public
--     grant all on tables to anon, authenticated;
--   alter default privileges for role postgres in schema public
--     grant all on sequences to anon, authenticated;
--   alter default privileges for role postgres in schema public
--     grant all on functions to anon, authenticated;
--   alter default privileges for role postgres
--     grant execute on functions to public;
-- (find_or_create_itinerary's anon revoke predates this, in 006 — leave it.)

begin;

-- ── Tables: clear the API roles, then grant exactly what's used ──────────
revoke all on table itineraries, watches, price_checks, alerts from anon, authenticated;

grant select on table itineraries, price_checks, alerts to authenticated;
grant select, insert, update on table watches to authenticated;

grant all on table itineraries, watches, price_checks, alerts to service_role;

-- ── latest_prices view: unused by any code, so no API access ──────────────
revoke all on table latest_prices from anon, authenticated;
grant all on table latest_prices to service_role;

-- ── Functions ─────────────────────────────────────────────────────────────
-- find_or_create_itinerary: already correct since 006; restated so this
-- migration alone describes the full intended state.
revoke all on function find_or_create_itinerary(text, text, date, date, text, integer)
  from public, anon;
grant execute on function find_or_create_itinerary(text, text, date, date, text, integer)
  to authenticated, service_role;

-- Trigger function: fires on UPDATE of watches regardless of the caller's
-- EXECUTE privilege (checked only when the trigger is created), so nobody
-- needs to be able to call it.
revoke all on function set_watch_status_changed_at() from public, anon, authenticated;

-- ── Defaults for objects created in future ───────────────────────────────
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
-- Postgres itself grants EXECUTE on every new function to PUBLIC (and so to
-- anon) by default. That built-in default can only be removed globally, not
-- per schema (an IN SCHEMA revoke is silently a no-op — caught in the dry
-- run), so this applies to functions `postgres` creates in any schema. That
-- is the intent anyway: every function should state who may call it.
alter default privileges for role postgres
  revoke execute on functions from public;

commit;

-- Verify:
-- select relname, relacl from pg_class
--  where relnamespace = 'public'::regnamespace and relkind in ('r','v');
-- select pg_get_userbyid(defaclrole), defaclnamespace::regnamespace, defaclobjtype,
--        defaclacl from pg_default_acl where defaclrole = 'postgres'::regrole;

-- Mark which price_checks rows are our own checks and which were copied in
-- from Google's price history.
--
-- A new all-Alaska watch (migration 010) used to start blind: lib/alerts.ts
-- needs 7 checks before any alert, so for a week it could say nothing. But
-- the all-Alaska search already returns Google's own daily price history
-- for that exact search (SerpApi price_insights.price_history, ~60 days).
-- Because it's the SAME filtered search we run every day, those points
-- describe the same thing we track — verified 2026-10-22: its last point,
-- $854, equalled the cheapest all-Alaska SEA→TPA trip returned. (Unfiltered
-- it would NOT: that history is the cheapest fare on any airline, ~$400 vs
-- the ~$680 we tracked then.) So watch creation now copies those days in.
--
--   'check'          — our own check (cron or watch creation). Every
--                      existing row; the default for every insert.
--   'google_history' — a day from Google's history. Cash only, no miles.
--
-- The column lets code tell them apart where it matters: the cron's
-- "checked in the last 12h" skip counts own checks only; alerts take the
-- watch-start anchor from the first own check; the UI says "3 checks + 60
-- days from Google" rather than "63 checks".
--
-- Additive, with a default — safe to apply before the code ships, and
-- existing inserts keep working unchanged. No grant changes needed
-- (columns follow the table's grants, migration 007).

alter table price_checks
  add column if not exists source text not null default 'check';

alter table price_checks
  add constraint price_checks_source_check
  check (source in ('check', 'google_history'));

-- Verify:
-- select source, count(*) from price_checks group by 1;

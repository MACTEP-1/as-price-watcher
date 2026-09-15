-- ─────────────────────────────────────────────────────────────────────────
-- 002 — Allow 'cumulative_drop' as an alerts.alert_type value.
--
-- Run this ONCE, in the Supabase SQL editor, as a single transaction.
-- Deploy the matching application code (lib/alerts.ts, the cron route) at
-- the same time: once that code ships, evaluateAlerts() can return a
-- trigger with type 'cumulative_drop', and inserting that into `alerts`
-- fails against the OLD constraint until this runs.
--
-- WHY
--
-- new_low and drop_10pct both compare the latest price against a baseline
-- that moves EVERY DAY (a 7-day rolling average; the previous low, which in
-- a declining series is just yesterday's price). Both degrade to "did today
-- beat yesterday by the margin?" — so a real, steady decline under about
-- 2%/day is invisible FOREVER, however large it gets. Quantified in
-- lib/__tests__/alerts-noise.test.mts: a smooth 20% decline over 14 days
-- never fired a single alert under any settings tried.
--
-- cumulative_drop compares against the price the user was actually LAST
-- TOLD ABOUT — an anchor that only moves when an alert fires, not every
-- day — so a slow bleed keeps accumulating against a fixed point instead of
-- resetting its progress every check. See lib/alerts.ts's header comment
-- for the full reasoning.
--
-- The constraint name below is discovered dynamically rather than assumed,
-- since an inline `check (...)` in a `create table` gets a Postgres-chosen
-- name (conventionally `alerts_alert_type_check`, but not guaranteed) — this
-- finds whatever it actually is by inspecting its definition, so the
-- migration works even if it was renamed at some point.
-- ─────────────────────────────────────────────────────────────────────────

begin;

do $$
declare
  existing_constraint text;
begin
  select con.conname into existing_constraint
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'alerts'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) like '%alert_type%';

  if existing_constraint is not null then
    execute format('alter table alerts drop constraint %I', existing_constraint);
  end if;
end $$;

alter table alerts
  add constraint alerts_alert_type_check
  check (alert_type in ('drop_10pct', 'new_low', 'cumulative_drop'));

commit;

-- ── Verify ───────────────────────────────────────────────────────────────
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'alerts'::regclass and contype = 'c';
--   -- expect: alerts_alert_type_check ... IN ('drop_10pct', 'new_low', 'cumulative_drop')
-- insert into alerts (watch_id, user_id, alert_type, email_sent)
--   values ('00000000-0000-0000-0000-000000000000',
--           '00000000-0000-0000-0000-000000000000',
--           'cumulative_drop', false);  -- expect: fails on the FK, not the check
-- rollback;  -- if you ran the insert above to test, undo it — don't commit test data

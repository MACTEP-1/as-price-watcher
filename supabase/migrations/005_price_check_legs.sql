-- Records every leg of the tracked itinerary, not just the first flight
-- number, so the UI can show the whole routing and which leg is Alaska.
--
-- Why: on multi-carrier routes the "Alaska itinerary" is any itinerary with
-- SOME Alaska leg (lib/flights/serpapi-provider.ts, isAlaska). Seen live
-- 09/23-24: ZRH->SEA and GVA->SEA tracked 2-stop routings whose first legs
-- were Icelandair (FI 569), LOT (LO 412), SAS (SK 1610) and TAP (TP 945) -
-- and the card, which only had the first leg's flight_number, read as
-- "tracking Icelandair". The routing also changes day to day, which this
-- column makes visible.
--
-- Shape: [{ "flight": "LO412", "from": "ZRH", "to": "WAW" }, ...], in order.
-- OUTBOUND legs only on a round trip, same as flight_number/stops/duration
-- (the return legs need a second SerpApi call, deferred to a paid plan).
-- Null on rows written before this migration; the UI falls back to the
-- old flight_number-only line for those.
--
-- Adding a column needs no new GRANT: column privileges follow the table's,
-- so Supabase's 2026-10-30 change to default grants (which only affects NEW
-- tables) doesn't touch this.
--
-- ORDER: run this BEFORE deploying the code that writes `legs` - the cron
-- and watch creation insert it, so code-before-schema fails every insert.

begin;

alter table price_checks
  add column if not exists legs jsonb;

comment on column price_checks.legs is
  'Outbound legs of the tracked itinerary, in order: [{flight, from, to}]. Null before migration 005.';

commit;

-- Verify (after the next cron run):
-- select checked_at, flight_number, stops, legs
-- from price_checks order by checked_at desc limit 5;

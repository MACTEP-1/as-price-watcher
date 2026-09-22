-- Records the cheapest fare on ANY airline alongside the Alaska one we
-- track, so a card can say "AS $686 — but United has it at $427".
--
-- This costs NOTHING extra in SerpApi quota. The provider already receives
-- every carrier's itineraries in one response (best_flights + other_flights)
-- and then filters down to ones with an Alaska leg in our own code — the
-- cheaper non-Alaska fares were fetched and discarded. See
-- lib/flights/serpapi-provider.ts.
--
-- Both columns are nullable and stay null when there is nothing to say:
-- no cheaper rival, or the row itself is a non-Alaska fallback fare (which
-- happens when the route has no Alaska service and SERPAPI_STRICT_AS is
-- off — then `airline` already describes what was priced).
--
-- Deliberately NOT wired into lib/alerts.ts. Alerts stay about the Alaska
-- price: "price dropped" has to keep meaning one thing, and a rival's fare
-- moving is not a reason to email about this watch.

begin;

alter table price_checks
  add column if not exists competitor_cash_price numeric(10,2),
  add column if not exists competitor_airline    text;

comment on column price_checks.competitor_cash_price is
  'Cheapest fare on any airline in the same search, when it beats the tracked Alaska fare. Null otherwise.';
comment on column price_checks.competitor_airline is
  'Marketing airline for competitor_cash_price, as Google names it (e.g. "United").';

commit;

-- Verify (after the next cron run):
-- select checked_at, cash_price, competitor_cash_price, competitor_airline
-- from price_checks order by checked_at desc limit 5;

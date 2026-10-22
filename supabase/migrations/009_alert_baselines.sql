-- Record what each alert was actually measured against.
--
-- An alert row stored the price that fired it and `prev_cash_price` — the
-- check just before it — but NOT the value the alert logic compared
-- against (lib/alerts.ts AlertTrigger.baselineCashPrice/baselineMilesPrice:
-- the 7-day average for drop_10pct, the previous all-time low for new_low,
-- the last-reported or watch-start price for cumulative_drop). So reading
-- an alert back later, the only "was" figure on hand was the wrong one: the
-- 10/05 SEA→TPA new low reads "prev $1,047" (one odd day) when it was
-- measured against the $614 low, and explaining the 10/14 alert meant
-- replaying the whole price history by hand (2026-10-22). Open since a
-- second chat flagged it 09/21 ("Finding 3").
--
-- numeric for miles too: the drop_10pct baseline is an average, so it is
-- rarely a whole number of miles.
--
-- Additive and nullable: existing rows keep NULL (their baseline was never
-- recorded and can't be reconstructed reliably), and code that doesn't
-- write these columns keeps working — so this is safe to apply before the
-- cron change that fills them ships. No grant changes: column privileges
-- follow the table's (authenticated SELECT, service_role ALL — migration 007).

alter table alerts
  add column if not exists baseline_cash_price  numeric(10,2),
  add column if not exists baseline_miles_price numeric(12,2);

-- Verify:
-- select column_name, data_type, numeric_precision, numeric_scale
--   from information_schema.columns
--  where table_name = 'alerts' and column_name like 'baseline_%';

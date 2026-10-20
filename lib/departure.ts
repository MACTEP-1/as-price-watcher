// When is a watch's departure day over?
//
// depart_date is a DATE-ONLY string ('YYYY-MM-DD') with no timezone: the
// local date at the departure airport. We never know that airport's offset
// here, so the rule must hold for every timezone on earth.
//
// The departure day D ends LAST at UTC−12 (the westernmost offset), at
// midnight local = (D+1) 12:00 UTC. So the day is over everywhere exactly
// when the UTC date of (now − 12h) is after D. ISO dates sort
// chronologically, so a plain string < is correct.
//
// History: the cron used "depart_date < UTC date of (now − 24h)", i.e.
// (D+2) 00:00 UTC — 12 hours later than needed. With the daily run at
// 13:07 UTC that meant one extra run, the morning after departure, which
// spent a SerpApi search on a trip that had already left everywhere and
// stored an empty check (seen on ZRH→SEA and GVA→SEA, departing 10/13,
// checked 10/14 with no price). Before that, `new Date(depart_date)` (UTC
// midnight = 5pm the previous day in Pacific) retired watches while their
// flights were still bookable. This is the exact boundary between the two.

const LATEST_UTC_OFFSET_HOURS = 12 // UTC−12 is the last place a date ends

export function isDepartureDayOver(departDate: string, now: Date = new Date()): boolean {
  const shifted = new Date(now.getTime() - LATEST_UTC_OFFSET_HOURS * 60 * 60 * 1000)
  const latestDateStillRunning = shifted.toISOString().slice(0, 10)
  return departDate < latestDateStillRunning
}

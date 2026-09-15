-- Adds a real "when did this watch's status last change" timestamp, so the
-- Archive view can stop guessing (see components/ArchiveCard.tsx and
-- mobile/app/archive.tsx's old header comments: "No status-change timestamp
-- exists on the watches table — only created_at and the itinerary's
-- depart_date").
--
-- A trigger, not application code, keeps this correct. There are already
-- THREE call sites that change `status` (the DELETE /api/watches/[id] soft
-- delete, the unsubscribe link, and the cron's expiry path) and a trigger
-- can't be forgotten by a fourth one later — see CLAUDE.md's "audit for the
-- thing, don't work from the assumed list".

begin;

alter table watches
  add column if not exists status_changed_at timestamptz not null default now();

-- One-time backfill. Every existing row just received the ALTER's default
-- (this transaction's start time), which would make every watch archived
-- before today look like it changed status today. created_at is the best
-- available stand-in for anything archived before this column existed —
-- not exact, but not "today" either.
update watches set status_changed_at = created_at;

create or replace function set_watch_status_changed_at() returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_watches_status_changed_at on watches;
create trigger trg_watches_status_changed_at
  before update on watches
  for each row
  execute function set_watch_status_changed_at();

commit;

-- Verify:
-- select id, status, created_at, status_changed_at from watches order by created_at desc limit 10;
--
-- Verify the trigger fires (harmless no-op update — flips a watch to its own
-- current status and back, or just watch status_changed_at move on the next
-- real status change):
-- update watches set status = status where id = '<some watch id>';
-- select status, status_changed_at from watches where id = '<some watch id>';

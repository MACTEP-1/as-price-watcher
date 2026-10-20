-- Pin the search_path of set_watch_status_changed_at() (migration 003).
--
-- Flagged by Supabase's security advisor after 007 ("Function Search Path
-- Mutable"). A function without a fixed search_path resolves unqualified
-- names through whatever search_path the calling session has, so a role
-- able to create objects in a schema earlier on that path could shadow
-- something the function uses. Low risk here — since 007 nobody can call
-- this function directly, and its body only touches NEW/OLD and now() —
-- but it costs one line and keeps the advisor clean, so new warnings stand
-- out.
--
-- '' (empty), not 'public': the body references no tables, and now() lives
-- in pg_catalog, which Postgres always searches first regardless. Empty is
-- the strictest setting and what Supabase recommends.
--
-- Safe to run at any time: no code change depends on it; the trigger keeps
-- firing exactly as before (verified in a rolled-back dry run).

alter function set_watch_status_changed_at() set search_path = '';

-- Verify:
-- select proname, proconfig from pg_proc where proname = 'set_watch_status_changed_at';

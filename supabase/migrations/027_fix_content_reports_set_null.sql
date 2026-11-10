-- Fix: a reported post, comment or user could not be deleted.
--
-- Migration 023 made content_reports.target_post_id / target_comment_id /
-- target_user_id ON DELETE SET NULL, so a report outlives the thing it
-- reports (the snapshot columns keep the evidence). But the same table also
-- had a CHECK requiring *exactly one* target id to be non-null. Deleting the
-- target set its id to NULL, left the row with no target at all, and the
-- CHECK rejected it, aborting the delete.
--
-- Consequences found in device testing (2026-11-10): the demo seed failed
-- once a seeded comment had been reported, and the same path breaks
-- delete_my_account() (Guideline 5.1.1(v)) for any user whose post, comment
-- or account has ever been reported, and stops a reported post being deleted.
--
-- A second trap in the same table: uq_content_reports_one_per_reporter is
-- NULLS NOT DISTINCT, so two reports by one person whose targets were then
-- both deleted would both become (reporter, type, NULL, NULL, NULL) and
-- collide, again aborting the delete. De-duplication only matters while the
-- target exists, so the index now only covers reports that still have one.
--
-- Why relaxing the CHECK is safe: report_content() is the only way to insert
-- (the table has no insert policy), and it already raises 'That content no
-- longer exists' for a missing target, so new rows always start with their own
-- id set. The CHECK still forbids ids for the *other* target types.

alter table public.content_reports
  drop constraint content_reports_target_matches_type;

alter table public.content_reports
  add constraint content_reports_target_matches_type check (
    (target_type = 'post'    and target_comment_id is null and target_user_id    is null) or
    (target_type = 'comment' and target_post_id    is null and target_user_id    is null) or
    (target_type = 'user'    and target_post_id    is null and target_comment_id is null)
  );

drop index public.uq_content_reports_one_per_reporter;

create unique index uq_content_reports_one_per_reporter
  on public.content_reports (reporter_id, target_type, target_post_id, target_comment_id, target_user_id)
  nulls not distinct
  where reporter_id is not null
    and (target_post_id is not null or target_comment_id is not null or target_user_id is not null);

-- Verify (run after applying; expect the new definition, no "IS NOT NULL"
-- on a row's own target id, and the index predicate mentioning all three ids):
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'content_reports_target_matches_type';
--   select indexdef from pg_indexes
--    where indexname = 'uq_content_reports_one_per_reporter';

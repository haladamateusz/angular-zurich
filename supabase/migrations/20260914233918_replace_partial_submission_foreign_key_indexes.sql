-- Use full indexes for foreign-key support. Partial indexes help equality
-- lookups but are not recognised by every foreign-key audit and advisor.
drop index if exists submissions.talk_submissions_reviewed_by_idx;
drop index if exists submissions.talk_submission_status_events_actor_user_id_idx;

create index talk_submissions_reviewed_by_idx
  on submissions.talk_submissions (reviewed_by);

create index talk_submission_status_events_actor_user_id_idx
  on submissions.talk_submission_status_events (actor_user_id);

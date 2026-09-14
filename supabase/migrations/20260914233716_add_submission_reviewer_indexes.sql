-- Foreign keys do not create indexes automatically. These support reviewer
-- lookups and fast ON DELETE SET NULL operations on auth.users.
create index if not exists talk_submissions_reviewed_by_idx
  on submissions.talk_submissions (reviewed_by)
  where reviewed_by is not null;

create index if not exists talk_submission_status_events_actor_user_id_idx
  on submissions.talk_submission_status_events (actor_user_id)
  where actor_user_id is not null;

-- This table is used only by trusted server-side code. Keep all browser and
-- non-bypass roles denied even if they gain table privileges in the future.
drop policy if exists "Deny browser access to submission rate limits"
  on submissions.talk_submission_rate_limits;

create policy "Deny browser access to submission rate limits"
  on submissions.talk_submission_rate_limits
  as restrictive
  for all
  to public
  using (false)
  with check (false);

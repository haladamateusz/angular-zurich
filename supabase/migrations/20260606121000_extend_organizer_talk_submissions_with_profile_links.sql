drop view if exists public.organizer_talk_submissions;

create view public.organizer_talk_submissions
with (security_invoker = true) as
select
  id,
  created_at,
  status,
  talk_title,
  talk_description,
  slides_url,
  speaker_name,
  speaker_label,
  speaker_picture_path,
  personal_url,
  linkedin_url,
  github_url
from submissions.talk_submissions;

revoke all on table public.organizer_talk_submissions from public, anon;
grant select on table public.organizer_talk_submissions to authenticated;
grant select on table public.organizer_talk_submissions to service_role;

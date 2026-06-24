create or replace function private.can_current_user_read_talk_submission_assets()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_allowed_google_account(
    coalesce(auth.jwt() ->> 'email', '')
  );
$$;

grant execute on function private.can_current_user_read_talk_submission_assets() to authenticated;
revoke execute on function private.can_current_user_read_talk_submission_assets() from anon, public;

drop policy if exists "Allowed organizers can read talk submission assets" on storage.objects;

create policy "Allowed organizers can read talk submission assets"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'talk-submission-assets'
  and (select private.can_current_user_read_talk_submission_assets())
);

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
  speaker_picture_path
from submissions.talk_submissions;

revoke all on table public.organizer_talk_submissions from public, anon;
grant select on table public.organizer_talk_submissions to authenticated;
grant select on table public.organizer_talk_submissions to service_role;

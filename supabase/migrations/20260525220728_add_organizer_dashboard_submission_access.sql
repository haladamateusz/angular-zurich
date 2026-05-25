create or replace function private.can_current_user_read_talk_submissions()
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

grant execute on function private.can_current_user_read_talk_submissions() to authenticated;
revoke execute on function private.can_current_user_read_talk_submissions() from anon, public;

grant usage on schema submissions to authenticated;
grant select on submissions.talk_submissions to authenticated;

drop policy if exists "Allowed organizers can read talk submissions" on submissions.talk_submissions;

create policy "Allowed organizers can read talk submissions"
on submissions.talk_submissions
for select
to authenticated
using ((select private.can_current_user_read_talk_submissions()));

drop view if exists public.organizer_talk_submissions;

create view public.organizer_talk_submissions
with (security_invoker = true) as
select
  id,
  created_at,
  status,
  talk_title,
  speaker_name,
  speaker_label
from submissions.talk_submissions;

revoke all on table public.organizer_talk_submissions from public, anon;
grant select on table public.organizer_talk_submissions to authenticated;
grant select on table public.organizer_talk_submissions to service_role;

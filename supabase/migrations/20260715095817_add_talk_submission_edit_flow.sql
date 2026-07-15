alter table submissions.talk_submission_rate_limits
  drop constraint if exists talk_submission_rate_limits_scope_check;

alter table submissions.talk_submission_rate_limits
  add constraint talk_submission_rate_limits_scope_check
  check (scope in ('ip_15m', 'email_1d', 'edit_ip_15m', 'edit_token_15m'));

create or replace function private.get_talk_submission_for_device(
  p_submission_id uuid,
  p_edit_token text
)
returns table (
  id uuid,
  status submissions.talk_submission_status,
  talk_title text,
  talk_description text,
  slides_url text,
  speaker_first_name text,
  speaker_last_name text,
  speaker_label text,
  speaker_email text,
  speaker_bio text,
  personal_url text,
  twitter_url text,
  linkedin_url text,
  github_url text,
  speaker_picture_path text,
  can_edit boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ts.id,
    ts.status,
    ts.talk_title,
    ts.talk_description,
    ts.slides_url,
    coalesce(nullif(btrim(ts.speaker_first_name), ''), split_name.first_name),
    coalesce(nullif(btrim(ts.speaker_last_name), ''), split_name.last_name),
    ts.speaker_label,
    ts.speaker_email,
    ts.speaker_bio,
    ts.personal_url,
    ts.twitter_url,
    ts.linkedin_url,
    ts.github_url,
    ts.speaker_picture_path,
    ts.status in (
      'initially_submitted'::submissions.talk_submission_status,
      'adjusted'::submissions.talk_submission_status,
      'changes_requested'::submissions.talk_submission_status
    ) as can_edit
  from submissions.talk_submissions ts
  cross join lateral private.split_speaker_name(ts.speaker_name) split_name
  where ts.id = p_submission_id
    and ts.edit_token_hash = encode(extensions.digest(p_edit_token, 'sha256'), 'hex');
$$;

grant execute on function private.get_talk_submission_for_device(uuid, text) to anon, authenticated;
revoke execute on function private.get_talk_submission_for_device(uuid, text) from public;

create or replace function public.get_talk_submission_for_device(
  p_submission_id uuid,
  p_edit_token text
)
returns table (
  id uuid,
  status submissions.talk_submission_status,
  talk_title text,
  talk_description text,
  slides_url text,
  speaker_first_name text,
  speaker_last_name text,
  speaker_label text,
  speaker_email text,
  speaker_bio text,
  personal_url text,
  twitter_url text,
  linkedin_url text,
  github_url text,
  speaker_picture_path text,
  can_edit boolean
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.get_talk_submission_for_device(p_submission_id, p_edit_token);
$$;

grant execute on function public.get_talk_submission_for_device(uuid, text) to anon, authenticated;
revoke execute on function public.get_talk_submission_for_device(uuid, text) from public;

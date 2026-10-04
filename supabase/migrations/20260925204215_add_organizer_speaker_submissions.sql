-- Organizer proposals snapshot a profile while retaining its identity through approval.
alter table submissions.talk_submissions
  add column organizer_speaker_id uuid references public."People"(id) on delete restrict,
  add column organizer_speaker_picture_url text,
  add constraint talk_submissions_organizer_picture_check check (
    (organizer_speaker_id is null and organizer_speaker_picture_url is null)
    or (organizer_speaker_id is not null and organizer_speaker_picture_url is not null
      and organizer_speaker_picture_url ~* '^https?://[^\s]+$'
      and speaker_picture_path is null)
  );

create index talk_submissions_organizer_speaker_id_idx
  on submissions.talk_submissions (organizer_speaker_id);

create or replace view public.organizer_talk_submissions
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
  speaker_email,
  personal_url,
  linkedin_url,
  github_url,
  organizer_speaker_id,
  organizer_speaker_picture_url
from submissions.talk_submissions;

revoke all on table public.organizer_talk_submissions from public, anon;
grant select on table public.organizer_talk_submissions to authenticated;
grant select on table public.organizer_talk_submissions to service_role;

create or replace function private.ensure_speaker_for_submission(
  submission submissions.talk_submissions,
  public_speaker_picture_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  legacy_speaker_names record;
  speaker_first_name text;
  speaker_last_name text;
  speaker_id uuid;
begin
  if submission.organizer_speaker_id is not null then
    insert into public."PeopleOnRoles" (person_id, role)
    values (submission.organizer_speaker_id, 'SPEAKER'::public."ROLES")
    on conflict (person_id, role) do nothing;
    return submission.organizer_speaker_id;
  end if;

  speaker_first_name := nullif(btrim(coalesce(submission.speaker_first_name, '')), '');
  speaker_last_name := nullif(btrim(coalesce(submission.speaker_last_name, '')), '');

  if speaker_first_name is null and speaker_last_name is null then
    select *
    into legacy_speaker_names
    from private.split_speaker_name(submission.speaker_name);

    speaker_first_name := legacy_speaker_names.first_name;
    speaker_last_name := legacy_speaker_names.last_name;
  end if;

  select p."id"
  into speaker_id
  from public."People" p
  where lower(coalesce(p."first_name", '')) = lower(coalesce(speaker_first_name, ''))
    and lower(coalesce(p."last_name", '')) = lower(coalesce(speaker_last_name, ''))
  limit 1;

  if speaker_id is not null then
    update public."People" p
    set
      "email" = coalesce(submission.speaker_email, p."email"),
      "abstract" = submission.speaker_bio,
      "personal_url" = coalesce(submission.personal_url, p."personal_url"),
      "twitter_url" = coalesce(submission.twitter_url, p."twitter_url"),
      "linkedin_url" = coalesce(submission.linkedin_url, p."linkedin_url"),
      "github_url" = coalesce(submission.github_url, p."github_url"),
      "picture_url" = coalesce(public_speaker_picture_url, p."picture_url"),
      "label" = coalesce(submission.speaker_label, p."label")
    where p."id" = speaker_id
      and (
        p."email" is distinct from coalesce(submission.speaker_email, p."email")
        or p."abstract" is distinct from submission.speaker_bio
        or p."personal_url" is distinct from coalesce(submission.personal_url, p."personal_url")
        or p."twitter_url" is distinct from coalesce(submission.twitter_url, p."twitter_url")
        or p."linkedin_url" is distinct from coalesce(submission.linkedin_url, p."linkedin_url")
        or p."github_url" is distinct from coalesce(submission.github_url, p."github_url")
        or p."picture_url" is distinct from coalesce(public_speaker_picture_url, p."picture_url")
        or p."label" is distinct from coalesce(submission.speaker_label, p."label")
      );

    insert into public."PeopleOnRoles" ("person_id", "role")
    values (speaker_id, 'SPEAKER'::public."ROLES")
    on conflict ("person_id", "role") do nothing;

    return speaker_id;
  end if;

  insert into public."People" (
    "first_name",
    "last_name",
    "slug",
    "email",
    "abstract",
    "personal_url",
    "twitter_url",
    "linkedin_url",
    "github_url",
    "picture_url",
    "label"
  )
  values (
    speaker_first_name,
    speaker_last_name,
    private.get_unique_person_slug(speaker_first_name, speaker_last_name),
    submission.speaker_email,
    submission.speaker_bio,
    submission.personal_url,
    submission.twitter_url,
    submission.linkedin_url,
    submission.github_url,
    public_speaker_picture_url,
    submission.speaker_label
  )
  returning "id" into speaker_id;

  insert into public."PeopleOnRoles" ("person_id", "role")
  values (speaker_id, 'SPEAKER'::public."ROLES")
  on conflict ("person_id", "role") do nothing;

  return speaker_id;
end;
$$;

-- The RPC return table gains two columns; recreate its invoker wrapper and grants.
drop function public.get_talk_submission_for_device(uuid, text);
drop function private.get_talk_submission_for_device(uuid, text);

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
  can_edit boolean,
  organizer_speaker_id uuid,
  organizer_speaker_picture_url text
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
    ) as can_edit,
    ts.organizer_speaker_id,
    ts.organizer_speaker_picture_url
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
  can_edit boolean,
  organizer_speaker_id uuid,
  organizer_speaker_picture_url text
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

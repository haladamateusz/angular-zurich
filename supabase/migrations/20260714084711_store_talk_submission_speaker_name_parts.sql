alter table submissions.talk_submissions
  add column if not exists speaker_first_name text,
  add column if not exists speaker_last_name text;

with split_names as (
  select
    submission.id,
    split_name.first_name,
    split_name.last_name
  from submissions.talk_submissions submission
  cross join lateral private.split_speaker_name(submission.speaker_name) split_name
)
update submissions.talk_submissions submission
set
  speaker_first_name = split_names.first_name,
  speaker_last_name = split_names.last_name
from split_names
where submission.id = split_names.id
  and (
    submission.speaker_first_name is null
    or submission.speaker_last_name is null
  );

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

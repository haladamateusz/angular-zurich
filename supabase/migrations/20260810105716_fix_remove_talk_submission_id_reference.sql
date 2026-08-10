create or replace function private.remove_talk_submission(
  p_submission_id uuid
)
returns table (
  id uuid,
  speaker_picture_urls text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission submissions.talk_submissions;
  speaker record;
  removed_speaker_picture_urls text[] := array[]::text[];
begin
  if not private.can_current_user_read_talk_submissions() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select *
  into submission
  from submissions.talk_submissions ts
  where ts.id = p_submission_id
  for update;

  if not found then
    raise exception 'talk_submission_not_found' using errcode = 'P0002';
  end if;

  for speaker in
    select p."id", p."picture_url"
    from public."People" p
    join public."SpeakerOnTalk" sot on sot."speaker_id" = p."id"
    join public."Talks" t on t."id" = sot."talk_id"
    where t."source_talk_submission_id" = submission.id
    for update of p
  loop
    delete from public."Talks"
    where "source_talk_submission_id" = submission.id;

    if not exists (
      select 1
      from public."SpeakerOnTalk" remaining_talk
      where remaining_talk."speaker_id" = speaker."id"
    ) and not exists (
      select 1
      from public."PeopleOnRoles" role_assignment
      where role_assignment."person_id" = speaker."id"
        and role_assignment."role" <> 'SPEAKER'::public."ROLES"
    ) then
      if speaker."picture_url" is not null then
        removed_speaker_picture_urls := array_append(
          removed_speaker_picture_urls,
          speaker."picture_url"
        );
      end if;

      delete from public."People" person
      where person."id" = speaker."id";
    end if;
  end loop;

  delete from public."Talks"
  where "source_talk_submission_id" = submission.id;

  delete from submissions.talk_submissions ts
  where ts.id = submission.id;

  return query
  select submission.id, removed_speaker_picture_urls;
end;
$$;

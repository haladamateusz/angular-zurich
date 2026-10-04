-- Run after all migrations. Synthetic fixtures and schema assertions always roll back.
begin;

do $$
declare
  v_person_id uuid := gen_random_uuid();
  duplicate_id uuid := gen_random_uuid();
  submission_id uuid := gen_random_uuid();
  submission submissions.talk_submissions;
  approval record;
  editable record;
  people_before bigint;
  original_profile jsonb;
  token text := repeat('organizer-test-token-', 4);
begin
  insert into public."People" (id, first_name, last_name, slug, email, abstract, picture_url, label)
  values
    (duplicate_id, 'Organizer', 'Fixture', 'duplicate-' || duplicate_id, 'duplicate@example.com',
      'Another person with the same name.', 'https://example.com/duplicate.png', 'Duplicate'),
    (v_person_id, 'Organizer', 'Fixture', 'organizer-' || v_person_id, 'organizer@example.com',
      'The current profile must survive proposal approval unchanged.', 'https://example.com/current.png', 'Current role');
  insert into public."PeopleOnRoles" (person_id, role) values (v_person_id, 'ORGANIZER');
  select to_jsonb(p) into original_profile from public."People" p where p.id = v_person_id;
  select count(*) into people_before from public."People";

  insert into submissions.talk_submissions (
    id, talk_title, talk_description, slides_url, speaker_first_name, speaker_last_name,
    speaker_name, speaker_email, speaker_bio, speaker_label, organizer_speaker_id,
    organizer_speaker_picture_url, edit_token_hash
  ) values (
    submission_id, 'Organizer proposal fixture',
    'A sufficiently detailed talk proposal for testing organizer speaker identity.',
    'https://example.com/slides', 'Organizer', 'Fixture', 'Organizer Fixture',
    'old-profile@example.com', 'An older biography captured at proposal submission time.', 'Old role',
    v_person_id, 'https://example.com/snapshot.png', encode(extensions.digest(token, 'sha256'), 'hex')
  ) returning * into submission;

  if submission.status <> 'initially_submitted' then
    raise exception 'Organizer proposals must enter normal review';
  end if;

  select * into editable from public.get_talk_submission_for_device(submission_id, token);
  if editable.organizer_speaker_id is distinct from v_person_id
    or editable.organizer_speaker_picture_url is distinct from 'https://example.com/snapshot.png'
    or editable.can_edit is distinct from true then
    raise exception 'Device edit result must preserve organizer identity and photo';
  end if;
  if exists (select 1 from public.get_talk_submission_for_device(submission_id, 'wrong-token')) then
    raise exception 'Invalid edit tokens must not expose the profile';
  end if;

  select * into approval from private.approve_talk_submission(
    submission, 'Test organizer', 'https://example.com/untrusted-replacement.png'
  );
  if approval.approved_speaker_id is distinct from v_person_id then
    raise exception 'Approval must use the selected person ID even when names collide';
  end if;
  if (select to_jsonb(p) from public."People" p where p.id = v_person_id) is distinct from original_profile then
    raise exception 'Organizer approval must not overwrite the live profile';
  end if;
  if (select count(*) from public."People") <> people_before then
    raise exception 'Organizer approval must not create a duplicate person';
  end if;
  if not exists (select 1 from public."PeopleOnRoles" r where r.person_id = v_person_id and r.role = 'SPEAKER') then
    raise exception 'Approval must ensure the speaker role';
  end if;
  if not exists (select 1 from public."SpeakerOnTalk" s where s.speaker_id = v_person_id and s.talk_id = approval.approved_talk_id) then
    raise exception 'Approved talk must be linked to the selected organizer';
  end if;
  perform private.approve_talk_submission(submission, 'Test organizer', null);
  if (select count(*) from public."SpeakerOnTalk" s where s.talk_id = approval.approved_talk_id) <> 1 then
    raise exception 'Repeated approval must retain one speaker assignment';
  end if;

  -- Existing public proposals still resolve and update their speaker profile as before.
  submission.organizer_speaker_id := null;
  submission.organizer_speaker_picture_url := null;
  submission.speaker_first_name := 'Standard';
  submission.speaker_last_name := 'Fixture';
  submission.speaker_name := 'Standard Fixture';
  v_person_id := private.ensure_speaker_for_submission(submission, 'https://example.com/standard.png');
  if not exists (select 1 from public."People" p where p.id = v_person_id and p.email = 'old-profile@example.com') then
    raise exception 'Standard proposal approval must retain its profile creation behavior';
  end if;
end;
$$;

do $$
declare
  organizer_id uuid;
  submission submissions.talk_submissions;
  original_profile jsonb;
  biography text;
  invalid_biography text;
  failed_constraint text;
  approval record;
begin
  foreach biography in array array[null::text, 'A biography added to the live profile after submission.'] loop
    organizer_id := gen_random_uuid();
    insert into public."People" (id, first_name, last_name, slug, email, abstract, picture_url)
    values (organizer_id, 'Empty', 'Biography', 'empty-bio-' || organizer_id,
      'empty-bio@example.com', biography, 'https://example.com/organizer.png');
    insert into public."PeopleOnRoles" (person_id, role) values (organizer_id, 'ORGANIZER');
    select to_jsonb(p) into original_profile from public."People" p where p.id = organizer_id;

    insert into submissions.talk_submissions (
      talk_title, talk_description, slides_url, speaker_first_name, speaker_last_name,
      speaker_name, speaker_email, speaker_bio, organizer_speaker_id, organizer_speaker_picture_url
    ) values (
      'Organizer without a biography', 'A detailed proposal to test an organizer without a biography.',
      'https://example.com/slides', 'Empty', 'Biography', 'Empty Biography',
      'empty-bio@example.com', '', organizer_id, 'https://example.com/organizer.png'
    ) returning * into submission;

    -- Removing the organizer link must not permit an empty standard biography.
    begin
      update submissions.talk_submissions
      set organizer_speaker_id = null, organizer_speaker_picture_url = null
      where id = submission.id;
      raise exception 'Standard proposals must reject empty biographies';
    exception when check_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      if failed_constraint <> 'talk_submissions_speaker_bio_length_check' then raise; end if;
    end;

    foreach invalid_biography in array array[repeat('x', 19), repeat('x', 4001)] loop
      begin
        update submissions.talk_submissions set speaker_bio = invalid_biography where id = submission.id;
        raise exception 'Nonempty organizer biographies must retain their length limits';
      exception when check_violation then
        get stacked diagnostics failed_constraint = constraint_name;
        if failed_constraint <> 'talk_submissions_speaker_bio_length_check' then raise; end if;
      end;
    end loop;

    select * into approval from private.approve_talk_submission(submission, 'Test organizer', null);
    if approval.approved_speaker_id is distinct from organizer_id
      or (select to_jsonb(p) from public."People" p where p.id = organizer_id) is distinct from original_profile then
      raise exception 'Approving an empty biography snapshot must preserve the linked profile';
    end if;
  end loop;
end;
$$;

rollback;

-- Only linked organizer proposals may omit the biography snapshot.
-- Profile data remains owned by People and is never modified by this migration.
alter table submissions.talk_submissions
  drop constraint talk_submissions_speaker_bio_length_check,
  add constraint talk_submissions_speaker_bio_length_check check (
    char_length(btrim(speaker_bio)) between 20 and 4000
    or (organizer_speaker_id is not null and speaker_bio = '')
  );

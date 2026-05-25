alter table submissions.talk_submissions
  add column if not exists speaker_label text;

alter table submissions.talk_submissions
  drop constraint if exists talk_submissions_speaker_label_length_check;

alter table submissions.talk_submissions
  add constraint talk_submissions_speaker_label_length_check
  check (
    speaker_label is null
    or char_length(btrim(speaker_label)) <= 160
  );

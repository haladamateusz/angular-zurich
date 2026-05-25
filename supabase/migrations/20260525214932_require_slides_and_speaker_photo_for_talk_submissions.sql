alter table submissions.talk_submissions
  drop constraint if exists talk_submissions_slides_url_check;

alter table submissions.talk_submissions
  add constraint talk_submissions_slides_url_check
  check (
    char_length(btrim(slides_url)) between 8 and 500
    and btrim(slides_url) ~* '^https?://[^\s]+$'
  ) not valid;

alter table submissions.talk_submissions
  drop constraint if exists talk_submissions_speaker_picture_path_length_check;

alter table submissions.talk_submissions
  add constraint talk_submissions_speaker_picture_path_length_check
  check (
    char_length(btrim(speaker_picture_path)) between 10 and 1024
  ) not valid;

alter table submissions.talk_submissions
  add column if not exists slides_url text;

alter table submissions.talk_submissions
  drop constraint if exists talk_submissions_slides_url_check;

alter table submissions.talk_submissions
  add constraint talk_submissions_slides_url_check
    check (
      slides_url is null
      or (
        char_length(btrim(slides_url)) between 8 and 500
        and btrim(slides_url) ~* '^https?://[^\s]+$'
      )
    );

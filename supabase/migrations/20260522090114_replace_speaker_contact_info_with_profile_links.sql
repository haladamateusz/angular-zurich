alter table submissions.talk_submissions
  drop constraint if exists talk_submissions_speaker_contact_info_length_check;

alter table submissions.talk_submissions
  drop column if exists speaker_contact_info;

alter table submissions.talk_submissions
  add column if not exists personal_url text,
  add column if not exists twitter_url text,
  add column if not exists linkedin_url text,
  add column if not exists github_url text;

alter table submissions.talk_submissions
  drop constraint if exists talk_submissions_personal_url_check,
  drop constraint if exists talk_submissions_twitter_url_check,
  drop constraint if exists talk_submissions_linkedin_url_check,
  drop constraint if exists talk_submissions_github_url_check;

alter table submissions.talk_submissions
  add constraint talk_submissions_personal_url_check
    check (
      personal_url is null
      or (
        char_length(btrim(personal_url)) between 8 and 500
        and btrim(personal_url) ~* '^https?://[^\s]+$'
      )
    ),
  add constraint talk_submissions_twitter_url_check
    check (
      twitter_url is null
      or (
        char_length(btrim(twitter_url)) between 8 and 500
        and btrim(twitter_url) ~* '^https?://[^\s]+$'
      )
    ),
  add constraint talk_submissions_linkedin_url_check
    check (
      linkedin_url is null
      or (
        char_length(btrim(linkedin_url)) between 8 and 500
        and btrim(linkedin_url) ~* '^https?://[^\s]+$'
      )
    ),
  add constraint talk_submissions_github_url_check
    check (
      github_url is null
      or (
        char_length(btrim(github_url)) between 8 and 500
        and btrim(github_url) ~* '^https?://[^\s]+$'
      )
    );

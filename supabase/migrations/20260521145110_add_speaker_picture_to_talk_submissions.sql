alter table submissions.talk_submissions
  add column if not exists speaker_picture_path text;

alter table submissions.talk_submissions
  drop constraint if exists talk_submissions_speaker_picture_path_length_check;

alter table submissions.talk_submissions
  add constraint talk_submissions_speaker_picture_path_length_check
    check (
      speaker_picture_path is null
      or char_length(btrim(speaker_picture_path)) between 10 and 1024
    );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'talk-submission-assets',
  'talk-submission-assets',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

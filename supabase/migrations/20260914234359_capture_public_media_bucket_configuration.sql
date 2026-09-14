-- Existing public media buckets captured from production configuration.
-- Public access is intentional for website profile images and sponsor logos.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  ('avatars', 'avatars', true, null, array['image/jpeg', 'image/png']),
  ('sponsors', 'sponsors', true, null, array['image/svg+xml'])
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

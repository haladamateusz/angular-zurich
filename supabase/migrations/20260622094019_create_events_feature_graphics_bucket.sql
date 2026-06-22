insert into storage.buckets (
  id,
  name,
  public,
  allowed_mime_types
)
values (
  'events-feature-graphics',
  'events-feature-graphics',
  true,
  array['image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  allowed_mime_types = excluded.allowed_mime_types;

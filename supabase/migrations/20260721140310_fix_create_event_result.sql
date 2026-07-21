create or replace function private.create_event_with_talks_with_public(
  p_title text,
  p_starts_at timestamptz,
  p_meetup_url text,
  p_venue_id uuid,
  p_feature_graphic_url text,
  p_talk_ids uuid[],
  p_public boolean
)
returns table (
  id uuid,
  slug text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_event_id uuid;
  created_event_slug text;
  updated_event_count integer;
begin
  select created.id, created.slug
  into created_event_id, created_event_slug
  from private.create_event_with_talks(
    p_title,
    p_starts_at,
    p_meetup_url,
    p_venue_id,
    p_feature_graphic_url,
    p_talk_ids
  ) as created;

  if created_event_id is null then
    raise exception 'create_event_result_missing' using errcode = 'P0001';
  end if;

  update public."Events" as event
  set "public" = p_public
  where event."id" = created_event_id;

  get diagnostics updated_event_count = row_count;

  if updated_event_count <> 1 then
    raise exception 'event_visibility_update_failed' using errcode = 'P0001';
  end if;

  return query
  select created_event_id, created_event_slug;
end;
$$;

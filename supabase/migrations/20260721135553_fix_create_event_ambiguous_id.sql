create or replace function private.create_event_with_talks(
  p_title text,
  p_starts_at timestamptz,
  p_meetup_url text,
  p_venue_id uuid,
  p_feature_graphic_url text,
  p_talk_ids uuid[]
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
  normalized_title text := btrim(coalesce(p_title, ''));
  normalized_meetup_url text := btrim(coalesce(p_meetup_url, ''));
  normalized_feature_graphic_url text := btrim(coalesce(p_feature_graphic_url, ''));
  talk_count integer := coalesce(cardinality(p_talk_ids), 0);
  distinct_talk_count integer;
  assignable_talk_count integer;
  assigned_submission_count integer;
  base_slug text;
  candidate_slug text;
  slug_suffix integer := 1;
  created_event_id uuid;
  reviewer record;
begin
  if not private.can_current_user_read_talk_submissions() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  if char_length(normalized_title) not between 3 and 160 then
    raise exception 'event_title_invalid' using errcode = '22023';
  end if;

  if p_starts_at is null or p_starts_at <= now() then
    raise exception 'event_start_invalid' using errcode = '22023';
  end if;

  if char_length(normalized_meetup_url) > 500
    or normalized_meetup_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'event_meetup_url_invalid' using errcode = '22023';
  end if;

  if char_length(normalized_feature_graphic_url) > 1000
    or normalized_feature_graphic_url !~* '^https?://[^[:space:]]+$' then
    raise exception 'event_feature_graphic_url_invalid' using errcode = '22023';
  end if;

  if p_venue_id is null or not exists (
    select 1
    from public."Venues" venue
    where venue."id" = p_venue_id
  ) then
    raise exception 'event_venue_invalid' using errcode = '23503';
  end if;

  if talk_count not between 2 and 3 then
    raise exception 'event_talk_count_invalid' using errcode = '22023';
  end if;

  if array_position(p_talk_ids, null) is not null then
    raise exception 'event_talk_id_invalid' using errcode = '22023';
  end if;

  select count(distinct selected_talk_id)
  into distinct_talk_count
  from unnest(p_talk_ids) as selected(selected_talk_id);

  if distinct_talk_count <> talk_count then
    raise exception 'event_talks_must_be_unique' using errcode = '23514';
  end if;

  perform 1
  from public."Talks" talk
  where talk."id" = any(p_talk_ids)
  order by talk."id"
  for update;

  select count(*)
  into assignable_talk_count
  from public."Talks" talk
  join submissions.talk_submissions submission
    on submission.id = talk."source_talk_submission_id"
  where talk."id" = any(p_talk_ids)
    and talk."event_id" is null
    and submission.status = 'approved'::submissions.talk_submission_status;

  if assignable_talk_count <> talk_count then
    raise exception 'event_talk_not_assignable' using errcode = '23514';
  end if;

  base_slug := private.slugify_event_title(normalized_title);
  perform pg_advisory_xact_lock(hashtext('event-slug:' || base_slug));
  candidate_slug := base_slug;

  while exists (
    select 1
    from public."Events" event
    where event."slug" = candidate_slug
  ) loop
    slug_suffix := slug_suffix + 1;
    candidate_slug := base_slug || '-' || slug_suffix::text;
  end loop;

  insert into public."Events" as event (
    "title",
    "slug",
    "feature_graphic",
    "meetup_url",
    "starts_at",
    "venue_id"
  )
  values (
    normalized_title,
    candidate_slug,
    normalized_feature_graphic_url,
    normalized_meetup_url,
    p_starts_at,
    p_venue_id
  )
  returning event."id" into created_event_id;

  with selected_talks as (
    select selected_talk_id, ordinality
    from unnest(p_talk_ids) with ordinality as selected(selected_talk_id, ordinality)
  )
  update public."Talks" talk
  set
    "event_id" = created_event_id,
    "sort_order" = selected.ordinality::integer * 10
  from selected_talks selected
  where talk."id" = selected.selected_talk_id;

  update submissions.talk_submissions submission
  set status = 'assigned_to_event'::submissions.talk_submission_status
  where submission.id in (
    select talk."source_talk_submission_id"
    from public."Talks" talk
    where talk."id" = any(p_talk_ids)
  )
    and submission.status = 'approved'::submissions.talk_submission_status;

  get diagnostics assigned_submission_count = row_count;

  if assigned_submission_count <> talk_count then
    raise exception 'event_submission_assignment_failed' using errcode = '23514';
  end if;

  select *
  into reviewer
  from private.get_current_reviewer();

  insert into submissions.talk_submission_status_events (
    submission_id,
    from_status,
    to_status,
    action,
    actor_kind,
    actor_user_id,
    actor_first_name,
    actor_last_name
  )
  select
    talk."source_talk_submission_id",
    'approved'::submissions.talk_submission_status,
    'assigned_to_event'::submissions.talk_submission_status,
    'assigned_to_event',
    'reviewer',
    reviewer.reviewer_user_id,
    reviewer.reviewer_first_name,
    reviewer.reviewer_last_name
  from unnest(p_talk_ids) with ordinality as selected(selected_talk_id, ordinality)
  join public."Talks" talk on talk."id" = selected.selected_talk_id
  order by selected.ordinality;

  return query
  select created_event_id, candidate_slug;
end;
$$;

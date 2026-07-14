alter table submissions.talk_submission_status_events
  drop constraint if exists talk_submission_status_events_action_check,
  add constraint talk_submission_status_events_action_check
    check (action in (
      'submitted',
      'adjusted',
      'changes_submitted',
      'approved',
      'assigned_to_event',
      'removed_from_event',
      'changes_requested',
      'rejected'
    ));

create or replace function private.validate_talk_submission_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'initially_submitted'::submissions.talk_submission_status then
      raise exception 'invalid_initial_talk_submission_status' using errcode = '23514';
    end if;

    return new;
  end if;

  if old.status = new.status then
    return new;
  end if;

  if new.status = 'adjusted'::submissions.talk_submission_status
    and old.status in (
      'initially_submitted'::submissions.talk_submission_status,
      'adjusted'::submissions.talk_submission_status
    ) then
    return new;
  end if;

  if new.status = 'changes_submitted'::submissions.talk_submission_status
    and old.status = 'changes_requested'::submissions.talk_submission_status then
    return new;
  end if;

  if new.status = 'changes_requested'::submissions.talk_submission_status
    and old.status in (
      'initially_submitted'::submissions.talk_submission_status,
      'adjusted'::submissions.talk_submission_status,
      'changes_submitted'::submissions.talk_submission_status
    ) then
    return new;
  end if;

  if new.status = 'approved'::submissions.talk_submission_status
    and old.status in (
      'initially_submitted'::submissions.talk_submission_status,
      'adjusted'::submissions.talk_submission_status,
      'changes_submitted'::submissions.talk_submission_status,
      'assigned_to_event'::submissions.talk_submission_status
    ) then
    return new;
  end if;

  if new.status = 'rejected'::submissions.talk_submission_status
    and old.status in (
      'initially_submitted'::submissions.talk_submission_status,
      'adjusted'::submissions.talk_submission_status,
      'changes_requested'::submissions.talk_submission_status,
      'changes_submitted'::submissions.talk_submission_status
    ) then
    return new;
  end if;

  if new.status = 'assigned_to_event'::submissions.talk_submission_status
    and old.status = 'approved'::submissions.talk_submission_status then
    return new;
  end if;

  raise exception 'invalid_talk_submission_status_transition' using errcode = '23514';
end;
$$;

create or replace function private.update_event_with_talks(
  p_event_id uuid,
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
  slug text,
  feature_graphic text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_title text := btrim(coalesce(p_title, ''));
  normalized_meetup_url text := btrim(coalesce(p_meetup_url, ''));
  normalized_feature_graphic_url text := nullif(btrim(coalesce(p_feature_graphic_url, '')), '');
  talk_count integer := coalesce(cardinality(p_talk_ids), 0);
  distinct_talk_count integer;
  selectable_talk_count integer;
  base_slug text;
  candidate_slug text;
  slug_suffix integer := 1;
  existing_event public."Events"%rowtype;
  removed_submission_ids uuid[] := array[]::uuid[];
  newly_assigned_submission_ids uuid[] := array[]::uuid[];
  reviewer record;
begin
  if not private.can_current_user_read_talk_submissions() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select *
  into existing_event
  from public."Events" event
  where event."id" = p_event_id
  for update;

  if existing_event."id" is null then
    raise exception 'event_not_found' using errcode = 'P0002';
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

  if normalized_feature_graphic_url is not null
    and (
      char_length(normalized_feature_graphic_url) > 1000
      or normalized_feature_graphic_url !~* '^https?://[^[:space:]]+$'
    ) then
    raise exception 'event_feature_graphic_url_invalid' using errcode = '22023';
  end if;

  if p_public is null then
    raise exception 'event_public_invalid' using errcode = '22023';
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
  where talk."event_id" = p_event_id
    or talk."id" = any(p_talk_ids)
  order by talk."id"
  for update;

  select count(*)
  into selectable_talk_count
  from public."Talks" talk
  join submissions.talk_submissions submission
    on submission.id = talk."source_talk_submission_id"
  where talk."id" = any(p_talk_ids)
    and (
      (
        talk."event_id" = p_event_id
        and submission.status = 'assigned_to_event'::submissions.talk_submission_status
      )
      or (
        talk."event_id" is null
        and submission.status = 'approved'::submissions.talk_submission_status
      )
    );

  if selectable_talk_count <> talk_count then
    raise exception 'event_talk_not_assignable' using errcode = '23514';
  end if;

  select coalesce(array_agg(talk."source_talk_submission_id"), array[]::uuid[])
  into removed_submission_ids
  from public."Talks" talk
  join submissions.talk_submissions submission
    on submission.id = talk."source_talk_submission_id"
  where talk."event_id" = p_event_id
    and talk."id" <> all(p_talk_ids)
    and submission.status = 'assigned_to_event'::submissions.talk_submission_status;

  select coalesce(array_agg(talk."source_talk_submission_id"), array[]::uuid[])
  into newly_assigned_submission_ids
  from public."Talks" talk
  join submissions.talk_submissions submission
    on submission.id = talk."source_talk_submission_id"
  where talk."id" = any(p_talk_ids)
    and talk."event_id" is null
    and submission.status = 'approved'::submissions.talk_submission_status;

  if normalized_title = existing_event."title" then
    candidate_slug := existing_event."slug";
  else
    base_slug := private.slugify_event_title(normalized_title);
    perform pg_advisory_xact_lock(hashtext('event-slug:' || base_slug));
    candidate_slug := base_slug;

    while exists (
      select 1
      from public."Events" event
      where event."slug" = candidate_slug
        and event."id" <> p_event_id
    ) loop
      slug_suffix := slug_suffix + 1;
      candidate_slug := base_slug || '-' || slug_suffix::text;
    end loop;
  end if;

  update public."Events" event
  set
    "title" = normalized_title,
    "slug" = candidate_slug,
    "feature_graphic" = coalesce(normalized_feature_graphic_url, event."feature_graphic"),
    "meetup_url" = normalized_meetup_url,
    "starts_at" = p_starts_at,
    "venue_id" = p_venue_id,
    "public" = p_public
  where event."id" = p_event_id;

  update public."Talks" talk
  set
    "event_id" = null,
    "sort_order" = 0
  where talk."event_id" = p_event_id
    and talk."id" <> all(p_talk_ids);

  with selected_talks as (
    select selected_talk_id, ordinality
    from unnest(p_talk_ids) with ordinality as selected(selected_talk_id, ordinality)
  )
  update public."Talks" talk
  set
    "event_id" = p_event_id,
    "sort_order" = selected.ordinality::integer * 10
  from selected_talks selected
  where talk."id" = selected.selected_talk_id;

  if cardinality(removed_submission_ids) > 0
    or cardinality(newly_assigned_submission_ids) > 0 then
    select *
    into reviewer
    from private.get_current_reviewer();
  end if;

  if cardinality(removed_submission_ids) > 0 then
    update submissions.talk_submissions submission
    set status = 'approved'::submissions.talk_submission_status
    where submission.id = any(removed_submission_ids)
      and submission.status = 'assigned_to_event'::submissions.talk_submission_status;

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
      removed_submission_id,
      'assigned_to_event'::submissions.talk_submission_status,
      'approved'::submissions.talk_submission_status,
      'removed_from_event',
      'reviewer',
      reviewer.reviewer_user_id,
      reviewer.reviewer_first_name,
      reviewer.reviewer_last_name
    from unnest(removed_submission_ids) as removed(removed_submission_id);
  end if;

  if cardinality(newly_assigned_submission_ids) > 0 then
    update submissions.talk_submissions submission
    set status = 'assigned_to_event'::submissions.talk_submission_status
    where submission.id = any(newly_assigned_submission_ids)
      and submission.status = 'approved'::submissions.talk_submission_status;

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
      assigned_submission_id,
      'approved'::submissions.talk_submission_status,
      'assigned_to_event'::submissions.talk_submission_status,
      'assigned_to_event',
      'reviewer',
      reviewer.reviewer_user_id,
      reviewer.reviewer_first_name,
      reviewer.reviewer_last_name
    from unnest(newly_assigned_submission_ids) as assigned(assigned_submission_id);
  end if;

  return query
  select event."id", event."slug", event."feature_graphic"
  from public."Events" event
  where event."id" = p_event_id;
end;
$$;

revoke execute on function private.update_event_with_talks(
  uuid,
  text,
  timestamptz,
  text,
  uuid,
  text,
  uuid[],
  boolean
) from public, anon;

grant execute on function private.update_event_with_talks(
  uuid,
  text,
  timestamptz,
  text,
  uuid,
  text,
  uuid[],
  boolean
) to authenticated, service_role;

create or replace function public.update_event_with_talks(
  p_event_id uuid,
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
  slug text,
  feature_graphic text
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.update_event_with_talks(
    p_event_id,
    p_title,
    p_starts_at,
    p_meetup_url,
    p_venue_id,
    p_feature_graphic_url,
    p_talk_ids,
    p_public
  );
$$;

revoke execute on function public.update_event_with_talks(
  uuid,
  text,
  timestamptz,
  text,
  uuid,
  text,
  uuid[],
  boolean
) from public, anon;

grant execute on function public.update_event_with_talks(
  uuid,
  text,
  timestamptz,
  text,
  uuid,
  text,
  uuid[],
  boolean
) to authenticated, service_role;

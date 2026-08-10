create or replace function private.remove_event_with_talk_unassignment(
  p_event_id uuid
)
returns table (
  id uuid,
  feature_graphic text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_event public."Events"%rowtype;
  removed_submission_ids uuid[] := array[]::uuid[];
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

  if not found then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;

  perform 1
  from public."Talks" talk
  where talk."event_id" = p_event_id
  order by talk."id"
  for update;

  select coalesce(array_agg(talk."source_talk_submission_id"), array[]::uuid[])
  into removed_submission_ids
  from public."Talks" talk
  join submissions.talk_submissions submission
    on submission.id = talk."source_talk_submission_id"
  where talk."event_id" = p_event_id
    and submission.status = 'assigned_to_event'::submissions.talk_submission_status;

  if cardinality(removed_submission_ids) > 0 then
    select *
    into reviewer
    from private.get_current_reviewer();
  end if;

  update public."Talks" talk
  set
    "event_id" = null,
    "sort_order" = 0
  where talk."event_id" = p_event_id;

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
      actor_last_name,
      message
    )
    select
      removed_submission_id,
      'assigned_to_event'::submissions.talk_submission_status,
      'approved'::submissions.talk_submission_status,
      'removed_from_event',
      'reviewer',
      reviewer.reviewer_user_id,
      reviewer.reviewer_first_name,
      reviewer.reviewer_last_name,
      format('Unassigned because the event “%s” was removed.', existing_event."title")
    from unnest(removed_submission_ids) as removed(removed_submission_id);
  end if;

  delete from public."Events" event
  where event."id" = p_event_id;

  return query
  select existing_event."id", existing_event."feature_graphic";
end;
$$;

revoke execute on function private.remove_event_with_talk_unassignment(uuid) from public, anon;
grant execute on function private.remove_event_with_talk_unassignment(uuid)
  to authenticated, service_role;

create or replace function public.remove_event_with_talk_unassignment(
  p_event_id uuid
)
returns table (
  id uuid,
  feature_graphic text
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.remove_event_with_talk_unassignment(p_event_id);
$$;

grant execute on function public.remove_event_with_talk_unassignment(uuid) to authenticated;
revoke execute on function public.remove_event_with_talk_unassignment(uuid) from anon, public;

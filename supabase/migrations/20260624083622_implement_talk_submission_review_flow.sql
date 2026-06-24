drop view if exists public.organizer_talk_submission_status_events;
drop view if exists public.organizer_talk_submissions;

create extension if not exists pgcrypto with schema extensions;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'speaker-images',
  'speaker-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table submissions.talk_submissions
  drop constraint if exists talk_submissions_review_consistency_check;

alter table submissions.talk_submissions
  alter column status drop default;

create type submissions.talk_submission_status_v2 as enum (
  'initially_submitted',
  'approved',
  'assigned_to_event',
  'changes_requested',
  'rejected',
  'adjusted',
  'changes_submitted'
);

alter table submissions.talk_submissions
  alter column status type submissions.talk_submission_status_v2
  using (
    case status::text
      when 'pending' then 'initially_submitted'
      when 'reviewing' then 'initially_submitted'
      when 'accepted' then 'approved'
      else status::text
    end
  )::submissions.talk_submission_status_v2;

drop type submissions.talk_submission_status;

alter type submissions.talk_submission_status_v2
  rename to talk_submission_status;

alter table submissions.talk_submissions
  alter column status set default 'initially_submitted'::submissions.talk_submission_status,
  add column if not exists edit_token_hash text;

alter table submissions.talk_submissions
  drop constraint if exists talk_submissions_edit_token_hash_length_check;

alter table submissions.talk_submissions
  add constraint talk_submissions_edit_token_hash_length_check
  check (
    edit_token_hash is null
    or edit_token_hash ~ '^[a-f0-9]{64}$'
  );

alter table public."Talks"
  alter column "event_id" drop not null,
  alter column "presentation_time" drop not null,
  add column if not exists "source_talk_submission_id" uuid;

alter table public."Talks"
  drop constraint if exists "Talks_source_talk_submission_id_fkey",
  drop constraint if exists "Talks_source_talk_submission_id_key";

alter table public."Talks"
  add constraint "Talks_source_talk_submission_id_fkey"
    foreign key ("source_talk_submission_id") references submissions.talk_submissions (id)
    on update cascade
    on delete set null,
  add constraint "Talks_source_talk_submission_id_key"
    unique ("source_talk_submission_id");

create table if not exists submissions.talk_submission_status_events (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions.talk_submissions (id)
    on update cascade
    on delete cascade,
  created_at timestamptz not null default now(),
  from_status submissions.talk_submission_status,
  to_status submissions.talk_submission_status not null,
  action text not null,
  actor_kind text not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_first_name text,
  actor_last_name text,
  message text,
  constraint talk_submission_status_events_action_check
    check (action in (
      'submitted',
      'adjusted',
      'changes_submitted',
      'approved',
      'assigned_to_event',
      'changes_requested',
      'rejected'
    )),
  constraint talk_submission_status_events_actor_kind_check
    check (actor_kind in ('speaker', 'reviewer', 'system')),
  constraint talk_submission_status_events_message_length_check
    check (message is null or char_length(btrim(message)) between 1 and 4000)
);

create index if not exists talk_submission_status_events_submission_created_at_idx
  on submissions.talk_submission_status_events (submission_id, created_at asc);

alter table submissions.talk_submission_status_events enable row level security;

revoke all on table submissions.talk_submission_status_events from public, anon, authenticated;
grant all on table submissions.talk_submission_status_events to service_role;
grant select on table submissions.talk_submission_status_events to authenticated;

grant usage on schema private to anon, authenticated;

drop policy if exists "Allowed organizers can read talk submission status events"
on submissions.talk_submission_status_events;

create policy "Allowed organizers can read talk submission status events"
on submissions.talk_submission_status_events
for select
to authenticated
using ((select private.can_current_user_read_talk_submissions()));

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
      'changes_submitted'::submissions.talk_submission_status
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

drop trigger if exists validate_talk_submission_status_transition
on submissions.talk_submissions;

create trigger validate_talk_submission_status_transition
before insert or update of status on submissions.talk_submissions
for each row
execute function private.validate_talk_submission_status_transition();

create or replace function private.create_initial_talk_submission_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into submissions.talk_submission_status_events (
    submission_id,
    to_status,
    action,
    actor_kind
  )
  values (
    new.id,
    new.status,
    'submitted',
    'speaker'
  );

  return new;
end;
$$;

drop trigger if exists create_initial_talk_submission_status_event
on submissions.talk_submissions;

create trigger create_initial_talk_submission_status_event
after insert on submissions.talk_submissions
for each row
execute function private.create_initial_talk_submission_status_event();

create or replace function private.create_talk_submission_adjustment_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'adjusted'::submissions.talk_submission_status then
    return new;
  end if;

  if old.status not in (
    'initially_submitted'::submissions.talk_submission_status,
    'adjusted'::submissions.talk_submission_status
  ) then
    return new;
  end if;

  if old.status = new.status
    and old.talk_title is not distinct from new.talk_title
    and old.talk_description is not distinct from new.talk_description
    and old.slides_url is not distinct from new.slides_url
    and old.speaker_name is not distinct from new.speaker_name
    and old.speaker_label is not distinct from new.speaker_label
    and old.speaker_email is not distinct from new.speaker_email
    and old.speaker_bio is not distinct from new.speaker_bio
    and old.personal_url is not distinct from new.personal_url
    and old.twitter_url is not distinct from new.twitter_url
    and old.linkedin_url is not distinct from new.linkedin_url
    and old.github_url is not distinct from new.github_url
    and old.speaker_picture_path is not distinct from new.speaker_picture_path then
    return new;
  end if;

  insert into submissions.talk_submission_status_events (
    submission_id,
    from_status,
    to_status,
    action,
    actor_kind
  )
  values (
    new.id,
    old.status,
    new.status,
    'adjusted',
    'speaker'
  );

  return new;
end;
$$;

drop trigger if exists create_talk_submission_adjustment_status_event
on submissions.talk_submissions;

create trigger create_talk_submission_adjustment_status_event
after update of
  status,
  talk_title,
  talk_description,
  slides_url,
  speaker_name,
  speaker_label,
  speaker_email,
  speaker_bio,
  personal_url,
  twitter_url,
  linkedin_url,
  github_url,
  speaker_picture_path
on submissions.talk_submissions
for each row
execute function private.create_talk_submission_adjustment_status_event();

insert into submissions.talk_submission_status_events (
  submission_id,
  created_at,
  to_status,
  action,
  actor_kind
)
select
  ts.id,
  ts.created_at,
  ts.status,
  case ts.status
    when 'approved'::submissions.talk_submission_status then 'approved'
    when 'rejected'::submissions.talk_submission_status then 'rejected'
    else 'submitted'
  end,
  'system'
from submissions.talk_submissions ts
where not exists (
  select 1
  from submissions.talk_submission_status_events event
  where event.submission_id = ts.id
);

create or replace function private.normalize_slug(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(value), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function private.get_unique_person_slug(
  first_name text,
  last_name text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_slug text;
  candidate_slug text;
  suffix integer := 1;
begin
  base_slug := private.normalize_slug(concat_ws(' ', first_name, last_name));

  if base_slug = '' then
    base_slug := 'speaker';
  end if;

  candidate_slug := base_slug;

  while exists (
    select 1
    from public."People"
    where "slug" = candidate_slug
  ) loop
    suffix := suffix + 1;
    candidate_slug := base_slug || '-' || suffix::text;
  end loop;

  return candidate_slug;
end;
$$;

create or replace function private.split_speaker_name(
  speaker_name text,
  out first_name text,
  out last_name text
)
returns record
language plpgsql
immutable
set search_path = ''
as $$
declare
  parts text[];
begin
  parts := regexp_split_to_array(regexp_replace(btrim(speaker_name), '\s+', ' ', 'g'), ' ');
  first_name := coalesce(parts[1], btrim(speaker_name));

  if array_length(parts, 1) > 1 then
    last_name := array_to_string(parts[2:array_length(parts, 1)], ' ');
  else
    last_name := '';
  end if;
end;
$$;

create or replace function private.get_current_reviewer(
  out reviewer_user_id uuid,
  out reviewer_first_name text,
  out reviewer_last_name text
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  reviewer_email text;
  display_name text;
  split_name record;
begin
  reviewer_user_id := auth.uid();
  reviewer_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  select p."first_name", p."last_name"
  into reviewer_first_name, reviewer_last_name
  from public."People" p
  where lower(p."email") = reviewer_email
  limit 1;

  if reviewer_first_name is not null or reviewer_last_name is not null then
    return;
  end if;

  display_name := coalesce(
    auth.jwt() -> 'user_metadata' ->> 'full_name',
    auth.jwt() -> 'user_metadata' ->> 'name',
    reviewer_email,
    'Organizer'
  );

  select *
  into split_name
  from private.split_speaker_name(display_name);

  reviewer_first_name := split_name.first_name;
  reviewer_last_name := split_name.last_name;
end;
$$;

create or replace function private.ensure_speaker_for_submission(
  submission submissions.talk_submissions,
  public_speaker_picture_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  speaker_names record;
  speaker_id uuid;
begin
  select *
  into speaker_names
  from private.split_speaker_name(submission.speaker_name);

  select p."id"
  into speaker_id
  from public."People" p
  where lower(coalesce(p."first_name", '')) = lower(coalesce(speaker_names.first_name, ''))
    and lower(coalesce(p."last_name", '')) = lower(coalesce(speaker_names.last_name, ''))
  limit 1;

  if speaker_id is not null then
    if public_speaker_picture_url is not null then
      update public."People"
      set "picture_url" = public_speaker_picture_url
      where "id" = speaker_id;
    end if;

    return speaker_id;
  end if;

  insert into public."People" (
    "first_name",
    "last_name",
    "slug",
    "email",
    "abstract",
    "personal_url",
    "twitter_url",
    "linkedin_url",
    "github_url",
    "picture_url",
    "label"
  )
  values (
    speaker_names.first_name,
    speaker_names.last_name,
    private.get_unique_person_slug(speaker_names.first_name, speaker_names.last_name),
    submission.speaker_email,
    submission.speaker_bio,
    submission.personal_url,
    submission.twitter_url,
    submission.linkedin_url,
    submission.github_url,
    public_speaker_picture_url,
    submission.speaker_label
  )
  returning "id" into speaker_id;

  insert into public."PeopleOnRoles" ("person_id", "role")
  values (speaker_id, 'SPEAKER'::public."ROLES")
  on conflict ("person_id", "role") do nothing;

  return speaker_id;
end;
$$;

create or replace function private.approve_talk_submission(
  submission submissions.talk_submissions,
  reviewer_name text,
  public_speaker_picture_url text default null,
  out approved_talk_id uuid,
  out approved_speaker_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  approved_speaker_id := private.ensure_speaker_for_submission(
    submission,
    public_speaker_picture_url
  );

  insert into public."Talks" (
    "title",
    "description",
    "event_id",
    "presentation_time",
    "created_by",
    "slides_url",
    "source_talk_submission_id"
  )
  values (
    submission.talk_title,
    submission.talk_description,
    null,
    null,
    reviewer_name,
    submission.slides_url,
    submission.id
  )
  on conflict ("source_talk_submission_id") do update
  set
    "title" = excluded."title",
    "description" = excluded."description",
    "slides_url" = excluded."slides_url"
  returning "id" into approved_talk_id;

  insert into public."SpeakerOnTalk" (
    "speaker_id",
    "talk_id"
  )
  values (
    approved_speaker_id,
    approved_talk_id
  )
  on conflict ("speaker_id", "talk_id") do nothing;
end;
$$;

create or replace function private.review_talk_submission(
  p_submission_id uuid,
  p_action text,
  p_message text default null,
  p_speaker_picture_url text default null
)
returns table (
  id uuid,
  status submissions.talk_submission_status,
  speaker_id uuid,
  speaker_picture_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission submissions.talk_submissions;
  reviewer record;
  previous_status submissions.talk_submission_status;
  next_status submissions.talk_submission_status;
  event_action text;
  normalized_message text;
  reviewer_display_name text;
  approval_result record;
  approved_speaker_id uuid := null;
  normalized_speaker_picture_url text;
begin
  if not private.can_current_user_read_talk_submissions() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select *
  into submission
  from submissions.talk_submissions ts
  where ts.id = p_submission_id
  for update;

  if not found then
    raise exception 'talk_submission_not_found' using errcode = 'P0002';
  end if;

  previous_status := submission.status;

  normalized_message := nullif(btrim(coalesce(p_message, '')), '');
  normalized_speaker_picture_url := nullif(btrim(coalesce(p_speaker_picture_url, '')), '');

  case p_action
    when 'approve' then
      next_status := 'approved'::submissions.talk_submission_status;
      event_action := 'approved';
    when 'request_changes' then
      next_status := 'changes_requested'::submissions.talk_submission_status;
      event_action := 'changes_requested';
    when 'reject' then
      next_status := 'rejected'::submissions.talk_submission_status;
      event_action := 'rejected';
    else
      raise exception 'invalid_review_action' using errcode = '22023';
  end case;

  if p_action in ('request_changes', 'reject') and normalized_message is null then
    raise exception 'review_message_required' using errcode = '23514';
  end if;

  if submission.status in (
    'approved'::submissions.talk_submission_status,
    'assigned_to_event'::submissions.talk_submission_status,
    'rejected'::submissions.talk_submission_status
  ) then
    raise exception 'talk_submission_already_finalized' using errcode = '23514';
  end if;

  if p_action in ('approve', 'request_changes')
    and submission.status = 'changes_requested'::submissions.talk_submission_status then
    raise exception 'talk_submission_changes_not_submitted' using errcode = '23514';
  end if;

  select *
  into reviewer
  from private.get_current_reviewer();

  reviewer_display_name := btrim(concat_ws(' ', reviewer.reviewer_first_name, reviewer.reviewer_last_name));

  if reviewer_display_name = '' then
    reviewer_display_name := 'Organizer';
  end if;

  if p_action = 'approve' then
    select *
    into approval_result
    from private.approve_talk_submission(
      submission,
      reviewer_display_name,
      normalized_speaker_picture_url
    );

    approved_speaker_id := approval_result.approved_speaker_id;
  end if;

  update submissions.talk_submissions ts
  set
    status = next_status,
    review_notes = normalized_message,
    reviewed_at = now(),
    reviewed_by = reviewer.reviewer_user_id
  where ts.id = p_submission_id
  returning ts.* into submission;

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
  values (
    submission.id,
    previous_status,
    next_status,
    event_action,
    'reviewer',
    reviewer.reviewer_user_id,
    reviewer.reviewer_first_name,
    reviewer.reviewer_last_name,
    normalized_message
  );

  return query
  select submission.id, submission.status, approved_speaker_id, submission.speaker_picture_path;
end;
$$;

grant execute on function private.review_talk_submission(uuid, text, text, text) to authenticated, service_role;
revoke execute on function private.review_talk_submission(uuid, text, text, text) from anon, public;

create or replace function public.review_talk_submission(
  p_submission_id uuid,
  p_action text,
  p_message text default null,
  p_speaker_picture_url text default null
)
returns table (
  id uuid,
  status submissions.talk_submission_status,
  speaker_id uuid,
  speaker_picture_path text
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.review_talk_submission(
    p_submission_id,
    p_action,
    p_message,
    p_speaker_picture_url
  );
$$;

grant execute on function public.review_talk_submission(uuid, text, text, text) to authenticated;
revoke execute on function public.review_talk_submission(uuid, text, text, text) from anon, public;

create or replace function private.get_talk_submission_status_for_device(
  p_submission_id uuid,
  p_edit_token text
)
returns table (
  id uuid,
  created_at timestamptz,
  status submissions.talk_submission_status,
  talk_title text,
  can_edit boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ts.id,
    ts.created_at,
    ts.status,
    ts.talk_title,
    ts.status in (
      'initially_submitted'::submissions.talk_submission_status,
      'adjusted'::submissions.talk_submission_status,
      'changes_requested'::submissions.talk_submission_status
    ) as can_edit
  from submissions.talk_submissions ts
  where ts.id = p_submission_id
    and ts.edit_token_hash = encode(extensions.digest(p_edit_token, 'sha256'), 'hex');
$$;

grant execute on function private.get_talk_submission_status_for_device(uuid, text) to anon, authenticated;
revoke execute on function private.get_talk_submission_status_for_device(uuid, text) from public;

create or replace function public.get_talk_submission_status_for_device(
  p_submission_id uuid,
  p_edit_token text
)
returns table (
  id uuid,
  created_at timestamptz,
  status submissions.talk_submission_status,
  talk_title text,
  can_edit boolean
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.get_talk_submission_status_for_device(p_submission_id, p_edit_token);
$$;

grant execute on function public.get_talk_submission_status_for_device(uuid, text) to anon, authenticated;
revoke execute on function public.get_talk_submission_status_for_device(uuid, text) from public;

create view public.organizer_talk_submissions
with (security_invoker = true) as
select
  id,
  created_at,
  status,
  talk_title,
  talk_description,
  slides_url,
  speaker_name,
  speaker_label,
  speaker_picture_path,
  personal_url,
  linkedin_url,
  github_url
from submissions.talk_submissions;

revoke all on table public.organizer_talk_submissions from public, anon;
grant select on table public.organizer_talk_submissions to authenticated;
grant select on table public.organizer_talk_submissions to service_role;

create view public.organizer_talk_submission_status_events
with (security_invoker = true) as
select
  id,
  submission_id,
  created_at,
  from_status,
  to_status,
  action,
  actor_kind,
  actor_first_name,
  actor_last_name,
  message
from submissions.talk_submission_status_events;

revoke all on table public.organizer_talk_submission_status_events from public, anon;
grant select on table public.organizer_talk_submission_status_events to authenticated;
grant select on table public.organizer_talk_submission_status_events to service_role;

-- Add "public" flag to control which events are visible to non-organizers.
-- Existing rows default to public=true.

alter table public."Events"
  add column if not exists "public" boolean not null default false;

update public."Events"
set "public" = true;

-- RLS: public users only see public events, organizers can see everything.
drop policy if exists "Public can read events" on public."Events";

create policy "Public can read public events"
on public."Events"
as permissive
for select
to anon, authenticated
using ("public" = true);

create policy "Organizers can read all events"
on public."Events"
as permissive
for select
to authenticated
using (public.can_current_user_manage_events());

-- Update the event creation RPC to accept p_public (default true).
-- We keep the heavy logic in private.create_event_with_talks and only set the flag afterwards.

drop function if exists public.create_event_with_talks(
  text,
  timestamptz,
  text,
  uuid,
  text,
  uuid[]
);

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
language sql
security definer
set search_path = ''
as $$
  with created as (
    select *
    from private.create_event_with_talks(
      p_title,
      p_starts_at,
      p_meetup_url,
      p_venue_id,
      p_feature_graphic_url,
      p_talk_ids
    )
  ),
  updated as (
    update public."Events" e
    set "public" = p_public
    from created c
    where e.id = c.id
    returning e.id
  )
  select created.id, created.slug
  from created
  join updated u
    on u.id = created.id;
$$;

create or replace function public.create_event_with_talks(
  p_title text,
  p_starts_at timestamptz,
  p_meetup_url text,
  p_venue_id uuid,
  p_feature_graphic_url text,
  p_talk_ids uuid[],
  p_public boolean default true
)
returns table (
  id uuid,
  slug text
)
language sql
security invoker
set search_path = ''
as $$
  select *
  from private.create_event_with_talks_with_public(
    p_title,
    p_starts_at,
    p_meetup_url,
    p_venue_id,
    p_feature_graphic_url,
    p_talk_ids,
    p_public
  );
$$;

revoke execute on function public.create_event_with_talks(
  text,
  timestamptz,
  text,
  uuid,
  text,
  uuid[],
  boolean
) from public, anon;

grant execute on function public.create_event_with_talks(
  text,
  timestamptz,
  text,
  uuid,
  text,
  uuid[],
  boolean
) to authenticated, service_role;


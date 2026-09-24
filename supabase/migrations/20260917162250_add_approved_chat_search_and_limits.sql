-- Published archive search deliberately has no February 2026 cutoff.
create or replace function private.can_current_user_chat()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and private.is_allowed_google_account(auth.jwt()->>'email');
$$;
revoke all on function private.can_current_user_chat() from public, anon;
grant execute on function private.can_current_user_chat() to authenticated;

create or replace function public.can_current_user_chat()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.can_current_user_chat();
$$;
revoke all on function public.can_current_user_chat() from public, anon;
grant execute on function public.can_current_user_chat() to authenticated;

create index if not exists talks_chat_search_idx on public."Talks" using gin
  ((setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')));

create or replace function public.search_chat_talks(
  p_query text default '', p_speaker_id uuid default null,
  p_event_id uuid default null, p_talk_id uuid default null,
  p_offset integer default 0
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_current_user_chat() then
    raise exception 'Chat access is not approved' using errcode = '42501';
  end if;
  if length(p_query) > 160 or p_offset < 0 or p_offset > 200 then
    raise exception 'Invalid search parameters' using errcode = '22023';
  end if;
  with matches as (
    select t.id, t.title, left(t.description, 800) as description,
      e.id as event_id, e.title as event_title, e.slug as event_slug, e.starts_at,
      coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', concat_ws(' ', p.first_name, p.last_name)) order by p.last_name, p.id)
        from public."SpeakerOnTalk" st join public."People" p on p.id = st.speaker_id
        where st.talk_id = t.id), '[]'::jsonb) as speakers,
      ts_rank((setweight(to_tsvector('english', coalesce(t.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(t.description, '')), 'B')),
        websearch_to_tsquery('english', p_query)) as rank
    from public."Talks" t join public."Events" e on e.id = t.event_id
    where e.public = true
      and (p_event_id is null or e.id = p_event_id)
      and (p_talk_id is null or t.id = p_talk_id)
      and (p_speaker_id is null or exists (select 1 from public."SpeakerOnTalk" st where st.talk_id = t.id and st.speaker_id = p_speaker_id))
      and (trim(p_query) = '' or
        (setweight(to_tsvector('english', coalesce(t.title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(t.description, '')), 'B')) @@ websearch_to_tsquery('english', p_query)
        or strpos(lower(coalesce(t.title, '') || ' ' || coalesce(t.description, '')), lower(trim(p_query))) > 0)
  ), page as (
    select * from matches order by rank desc, starts_at desc, id limit 11 offset p_offset
  ) select jsonb_build_object('items', coalesce((select jsonb_agg(to_jsonb(r) - 'rank') from
    (select * from page order by rank desc, starts_at desc, id limit 10) r), '[]'::jsonb),
    'hasMore', (select count(*) > 10 from page), 'nextOffset', p_offset + 10) into result;
  return result;
end;
$$;
revoke all on function public.search_chat_talks(text, uuid, uuid, uuid, integer) from public, anon;
grant execute on function public.search_chat_talks(text, uuid, uuid, uuid, integer) to authenticated;

create or replace function public.find_chat_entities(p_kind text, p_query text default '', p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_current_user_chat() then
    raise exception 'Chat access is not approved' using errcode = '42501';
  end if;
  if p_kind not in ('speakers', 'events') or length(p_query) > 160 or p_offset < 0 or p_offset > 200 then
    raise exception 'Invalid search parameters' using errcode = '22023';
  end if;
  if p_kind = 'speakers' then
    select jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), 'nextOffset', p_offset + 10) into result
    from (select p.id, concat_ws(' ', p.first_name, p.last_name) as name
      from public."People" p where strpos(lower(concat_ws(' ', p.first_name, p.last_name)), lower(trim(p_query))) > 0
      and exists (select 1 from public."SpeakerOnTalk" st join public."Talks" t on t.id = st.talk_id
        join public."Events" e on e.id = t.event_id where st.speaker_id = p.id and e.public = true)
      order by p.last_name, p.id limit 10 offset p_offset) r;
  else
    select jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb), 'nextOffset', p_offset + 10) into result
    from (select e.id, e.title, e.slug, e.starts_at
      from public."Events" e where e.public = true and strpos(lower(e.title), lower(trim(p_query))) > 0
      order by e.starts_at desc, e.id limit 10 offset p_offset) r;
  end if;
  return result;
end;
$$;
revoke all on function public.find_chat_entities(text, text, integer) from public, anon;
grant execute on function public.find_chat_entities(text, text, integer) to authenticated;

-- No prompts, tokens, or transcripts are stored. Reservations are retained on
-- failures because provider billing can be uncertain after a disconnect.
create table private.chat_runs (
  run_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  reserved_cents integer not null default 10 check (reserved_cents = 10)
);
alter table private.chat_runs enable row level security;
create index chat_runs_user_started_idx on private.chat_runs(user_id, started_at desc);
create index chat_runs_started_idx on private.chat_runs(started_at);
revoke all on private.chat_runs from public, anon, authenticated;

create function private.reserve_chat_run(p_user_id uuid, p_run_id uuid, p_daily_budget_cents integer)
returns text language plpgsql security definer set search_path = '' as $$
declare day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  -- Global lock covers the global daily cap and each user's overlapping limits.
  perform pg_advisory_xact_lock(782347128);
  if not exists (select 1 from auth.users u where u.id = p_user_id and private.is_allowed_google_account(u.email)) then return 'forbidden'; end if;
  if exists (select 1 from private.chat_runs where run_id = p_run_id) then return 'duplicate'; end if;
  if exists (select 1 from private.chat_runs where user_id = p_user_id and finished_at is null and started_at > now() - interval '2 minutes') then return 'busy'; end if;
  if (select count(*) from private.chat_runs where user_id = p_user_id and started_at > now() - interval '1 minute') >= 5 then return 'minute_limit'; end if;
  if (select count(*) from private.chat_runs where user_id = p_user_id and started_at >= day_start) >= 30 then return 'daily_limit'; end if;
  if p_daily_budget_cents is null or p_daily_budget_cents < 10 or
    (select coalesce(sum(reserved_cents), 0) from private.chat_runs where started_at >= day_start) + 10 > p_daily_budget_cents then return 'budget_limit'; end if;
  insert into private.chat_runs(run_id, user_id) values (p_run_id, p_user_id);
  return 'ok';
end;
$$;
create function public.reserve_chat_run(p_user_id uuid, p_run_id uuid, p_daily_budget_cents integer)
returns text language sql security invoker set search_path = '' as $$
  select private.reserve_chat_run(p_user_id, p_run_id, p_daily_budget_cents);
$$;
create function private.finish_chat_run(p_user_id uuid, p_run_id uuid)
returns void language sql security definer set search_path = '' as $$
  update private.chat_runs set finished_at = now() where user_id = p_user_id and run_id = p_run_id and finished_at is null;
$$;
create function public.finish_chat_run(p_user_id uuid, p_run_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.finish_chat_run(p_user_id, p_run_id);
$$;
revoke all on function private.reserve_chat_run(uuid, uuid, integer), public.reserve_chat_run(uuid, uuid, integer),
  private.finish_chat_run(uuid, uuid), public.finish_chat_run(uuid, uuid) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.reserve_chat_run(uuid, uuid, integer), public.reserve_chat_run(uuid, uuid, integer),
  private.finish_chat_run(uuid, uuid), public.finish_chat_run(uuid, uuid) to service_role;

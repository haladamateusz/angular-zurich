-- A bounded query vocabulary; no generated SQL. Counts precede pagination.
create or replace function public.query_chat_archive(
  p_mode text default 'talks', p_query text default '',
  p_speaker_id uuid default null, p_event_id uuid default null,
  p_from_year integer default null, p_to_year integer default null,
  p_period text default 'all', p_offset integer default 0
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_current_user_chat() then
    raise exception 'Chat access is not approved' using errcode = '42501';
  end if;
  if p_mode is null or p_mode not in ('talks', 'stats', 'ranking')
    or p_query is null or length(p_query) > 160
    or p_period is null or p_period not in ('all', 'past', 'upcoming')
    or p_offset is null or p_offset < 0 or p_offset > 200
    or (p_from_year is not null and p_from_year not between 1990 and 2100)
    or (p_to_year is not null and p_to_year not between 1990 and 2100)
    or p_from_year > p_to_year then
    raise exception 'Invalid archive filters' using errcode = '22023';
  end if;
  with matches as materialized (
    select t.id, t.title, left(t.description, 800) as description,
      e.id as event_id, e.title as event_title, e.slug as event_slug, e.starts_at,
      extract(year from e.starts_at at time zone 'Europe/Zurich')::integer as year
    from public."Talks" t join public."Events" e on e.id = t.event_id
    where e.public = true
      and (p_event_id is null or e.id = p_event_id)
      and (p_speaker_id is null or exists (select 1 from public."SpeakerOnTalk" st where st.talk_id = t.id and st.speaker_id = p_speaker_id))
      and (p_from_year is null or e.starts_at >= make_timestamptz(p_from_year, 1, 1, 0, 0, 0, 'Europe/Zurich'))
      and (p_to_year is null or e.starts_at < make_timestamptz(p_to_year + 1, 1, 1, 0, 0, 0, 'Europe/Zurich'))
      and (p_period <> 'past' or e.starts_at <= now())
      and (p_period <> 'upcoming' or e.starts_at > now())
      and (p_mode <> 'ranking' or e.starts_at <= now())
      and (trim(p_query) = '' or
        (setweight(to_tsvector('english', coalesce(t.title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(t.description, '')), 'B')) @@ websearch_to_tsquery('english', p_query)
        or strpos(lower(coalesce(t.title, '') || ' ' || coalesce(t.description, '')), lower(trim(p_query))) > 0)
  ), years as (
    select year, count(*) filter (where starts_at <= now()) as past,
      count(*) filter (where starts_at > now()) as upcoming
    from matches group by year
  ), counts as (
    select p.id, concat_ws(' ', p.first_name, p.last_name) as name, count(distinct m.id) as "talkCount"
    from matches m join public."SpeakerOnTalk" st on st.talk_id = m.id
      join public."People" p on p.id = st.speaker_id
    where p_speaker_id is null or p.id = p_speaker_id
    group by p.id, p.first_name, p.last_name
  ), ranked as (
    select *, dense_rank() over (order by "talkCount" desc) as rank from counts
  ), ranking_page as (
    select * from ranked order by "talkCount" desc, name, id limit 10 offset p_offset
  ), talk_page as (
    select m.*, coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', concat_ws(' ', p.first_name, p.last_name)) order by p.last_name, p.id)
      from public."SpeakerOnTalk" st join public."People" p on p.id = st.speaker_id where st.talk_id = m.id), '[]'::jsonb) as speakers
    from matches m order by starts_at desc, id limit 10 offset p_offset
  )
  select jsonb_build_object(
    'items', case when p_mode = 'ranking' then coalesce((select jsonb_agg(to_jsonb(r) order by "talkCount" desc, name, id) from ranking_page r), '[]'::jsonb)
      else coalesce((select jsonb_agg(to_jsonb(t) - 'year' order by starts_at desc, id) from talk_page t), '[]'::jsonb) end,
    'total', (select count(*) from matches),
    'past', (select count(*) from matches where starts_at <= now()),
    'upcoming', (select count(*) from matches where starts_at > now()),
    'years', coalesce((select jsonb_agg(to_jsonb(y) order by year) from years y), '[]'::jsonb),
    'totalSpeakers', (select count(*) from counts),
    'hasMore', p_offset < 200 and (case when p_mode = 'ranking' then (select count(*) from counts) else (select count(*) from matches) end) > p_offset + 10,
    'nextOffset', least(p_offset + 10, 200)
  ) into result;
  return result;
end;
$$;
revoke all on function public.query_chat_archive(text, text, uuid, uuid, integer, integer, text, integer) from public, anon;
grant execute on function public.query_chat_archive(text, text, uuid, uuid, integer, integer, text, integer) to authenticated;

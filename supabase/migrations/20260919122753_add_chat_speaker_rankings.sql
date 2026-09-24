-- Rank the entire past public archive before slicing a page. A co-presented
-- talk counts once for each speaker; unpublished and upcoming talks do not count.
create or replace function public.rank_chat_speakers(p_offset integer default 0)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_current_user_chat() then
    raise exception 'Chat access is not approved' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 or p_offset > 200 then
    raise exception 'Invalid ranking offset' using errcode = '22023';
  end if;
  with counts as (
    select p.id, concat_ws(' ', p.first_name, p.last_name) as name,
      count(distinct t.id) as "talkCount"
    from public."People" p
    join public."SpeakerOnTalk" st on st.speaker_id = p.id
    join public."Talks" t on t.id = st.talk_id
    join public."Events" e on e.id = t.event_id
    where e.public = true and e.starts_at <= now()
    group by p.id, p.first_name, p.last_name
  ), ranked as (
    select *, dense_rank() over (order by "talkCount" desc) as rank from counts
  ), page as (
    select * from ranked order by "talkCount" desc, name, id limit 10 offset p_offset
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by "talkCount" desc, name, id) from page), '[]'::jsonb),
    'totalSpeakers', (select count(*) from counts),
    'highestCount', coalesce((select max("talkCount") from counts), 0),
    'leaderCount', (select count(*) from ranked where rank = 1),
    'hasMore', (select count(*) > p_offset + 10 from counts),
    'nextOffset', p_offset + 10
  ) into result;
  return result;
end;
$$;
revoke all on function public.rank_chat_speakers(integer) from public, anon;
grant execute on function public.rank_chat_speakers(integer) to authenticated;

-- Exact totals are calculated over the full published archive, independently of pagination.
create or replace function public.get_chat_speaker_archive(
  p_name text, p_speaker_id uuid default null, p_offset integer default 0
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare candidates jsonb; person jsonb; result jsonb; totals jsonb;
begin
  if not public.can_current_user_chat() then
    raise exception 'Chat access is not approved' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) < 1 or length(p_name) > 160
    or p_offset is null or p_offset < 0 or p_offset > 200 then
    raise exception 'Invalid speaker parameters' using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) into candidates from (
    select p.id, concat_ws(' ', p.first_name, p.last_name) as name
    from public."People" p
    where (p_speaker_id is null or p.id = p_speaker_id)
      and not exists (
        select 1 from regexp_split_to_table(lower(trim(p_name)), '\s+') token
        where strpos(lower(concat_ws(' ', p.first_name, p.last_name)), token) = 0
      )
      and exists (select 1 from public."SpeakerOnTalk" st
        join public."Talks" t on t.id = st.talk_id join public."Events" e on e.id = t.event_id
        where st.speaker_id = p.id and e.public = true)
    order by p.last_name, p.first_name, p.id limit 11
  ) p;
  if jsonb_array_length(candidates) <> 1 then
    return jsonb_build_object('speakers', candidates, 'ambiguous', jsonb_array_length(candidates) > 1);
  end if;
  person := candidates->0;
  with talks as (
    select t.id, e.starts_at from public."Talks" t
    join public."Events" e on e.id = t.event_id
    where e.public = true and exists (select 1 from public."SpeakerOnTalk" st
      where st.talk_id = t.id and st.speaker_id = (person->>'id')::uuid)
  ), years as (
    select extract(year from starts_at at time zone 'Europe/Zurich')::integer as year,
      count(*) filter (where starts_at <= now()) as past,
      count(*) filter (where starts_at > now()) as upcoming
    from talks group by 1
  ) select jsonb_build_object('total', (select count(*) from talks),
    'past', (select count(*) from talks where starts_at <= now()),
    'upcoming', (select count(*) from talks where starts_at > now()),
    'years', coalesce((select jsonb_agg(to_jsonb(years) order by year) from years), '[]'::jsonb)) into totals;
  result := public.search_chat_talks(p_speaker_id => (person->>'id')::uuid, p_offset => p_offset);
  return jsonb_build_object('speakers', candidates, 'ambiguous', false,
    'stats', totals, 'page', result);
end;
$$;
revoke all on function public.get_chat_speaker_archive(text, uuid, integer) from public, anon;
grant execute on function public.get_chat_speaker_archive(text, uuid, integer) to authenticated;

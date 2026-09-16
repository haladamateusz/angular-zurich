-- Homepage totals include all public events, past and upcoming, even if they
-- have no talks. Explicit publication filters keep organizer totals public too.
create or replace function public.get_public_stats()
returns table (speakers bigint, talks bigint, events bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with public_events as (
    select e.id from public."Events" e where e.public = true
  ), public_talks as (
    select t.id from public."Talks" t
    join public_events e on e.id = t.event_id
  )
  select
    (select count(distinct s.speaker_id) from public."SpeakerOnTalk" s
      join public_talks t on t.id = s.talk_id),
    (select count(*) from public_talks),
    (select count(*) from public_events);
$$;

revoke all on function public.get_public_stats() from public;
grant execute on function public.get_public_stats() to anon, authenticated, service_role;

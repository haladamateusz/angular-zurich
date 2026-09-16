-- Run as postgres after migrations. All fixtures are rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create temporary table stats_baseline on commit drop as
select * from public.get_public_stats();
grant select on stats_baseline to anon, authenticated;
create temporary table stats_fixture on commit drop as
select gen_random_uuid() as speaker_id, gen_random_uuid() as hidden_speaker_id,
  gen_random_uuid() as venue_id, gen_random_uuid() as past_event_id,
  gen_random_uuid() as future_event_id, gen_random_uuid() as empty_event_id,
  gen_random_uuid() as private_event_id, gen_random_uuid() as past_talk_id,
  gen_random_uuid() as future_talk_id, gen_random_uuid() as private_talk_id,
  gen_random_uuid() as unassigned_talk_id,
  'stats-test-' || gen_random_uuid()::text || '@gmail.com' as organizer_email;

insert into private.allowed_google_accounts (email, active, first_name, last_name)
select organizer_email, true, 'Stats', 'Test' from stats_fixture;
insert into public."People" (id, first_name, last_name, slug)
select speaker_id, 'Stats', 'Public', speaker_id::text from stats_fixture
union all select hidden_speaker_id, 'Stats', 'Hidden', hidden_speaker_id::text from stats_fixture;
insert into public."Venues" (id, title, street, city, zip, latitude, longitude, created_by)
select venue_id, 'Stats test', 'Test', 'Test', '0000', 0, 0, 'stats-test' from stats_fixture;
insert into public."Events" (id, title, meetup_url, starts_at, venue_id, slug, public)
select v.id, 'Stats test', 'https://example.invalid', v.starts_at, f.venue_id, v.id::text, v.published
from stats_fixture f cross join lateral (values
  (f.past_event_id, now() - interval '10 years', true),
  (f.future_event_id, now() + interval '1 year', true),
  (f.empty_event_id, now() + interval '2 years', true),
  (f.private_event_id, now() - interval '1 year', false)
) v(id, starts_at, published);
insert into public."Talks" (id, title, description, event_id, created_by)
select v.id, 'Stats test', 'Test', v.event_id, 'stats-test'
from stats_fixture f cross join lateral (values
  (f.past_talk_id, f.past_event_id), (f.future_talk_id, f.future_event_id),
  (f.private_talk_id, f.private_event_id), (f.unassigned_talk_id, null::uuid)
) v(id, event_id);
insert into public."SpeakerOnTalk" (speaker_id, talk_id)
select v.speaker_id, v.talk_id from stats_fixture f cross join lateral (values
  (f.speaker_id, f.past_talk_id), (f.speaker_id, f.future_talk_id),
  (f.hidden_speaker_id, f.private_talk_id), (f.hidden_speaker_id, f.unassigned_talk_id)
) v(speaker_id, talk_id);

create function pg_temp.assert_public_stats()
returns void language plpgsql as $$
begin
  if not exists (
    select 1 from public.get_public_stats() s cross join stats_baseline b
    where s.events = b.events + 3 and s.talks = b.talks + 2 and s.speakers = b.speakers + 1
  ) then
    raise exception 'Incorrect public counts for %', current_user;
  end if;
end;
$$;

set local role anon;
select pg_temp.assert_public_stats();
reset role;
set local request.jwt.claims = '{"email":"outsider@example.invalid","role":"authenticated"}';
set local role authenticated;
select pg_temp.assert_public_stats();
reset role;
do $$ begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('email', organizer_email, 'role', 'authenticated')::text, true)
  from stats_fixture;
end; $$;
set local role authenticated;
select pg_temp.assert_public_stats();
reset role;
rollback;
select 'public stats regression checks passed; fixtures rolled back' as result;

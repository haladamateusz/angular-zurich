-- Run as postgres after migrations. All fixtures are rolled back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

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
select v.id, 'Signals regression sentinel', 'Angular signals and RxJS interop', v.event_id, 'stats-test'
from stats_fixture f cross join lateral (values
  (f.past_talk_id, f.past_event_id), (f.future_talk_id, f.future_event_id),
  (f.private_talk_id, f.private_event_id), (f.unassigned_talk_id, null::uuid)
) v(id, event_id);
insert into public."SpeakerOnTalk" (speaker_id, talk_id)
select v.speaker_id, v.talk_id from stats_fixture f cross join lateral (values
  (f.speaker_id, f.past_talk_id), (f.speaker_id, f.future_talk_id),
  (f.hidden_speaker_id, f.private_talk_id), (f.hidden_speaker_id, f.unassigned_talk_id)
) v(speaker_id, talk_id);


create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$ begin
  if value is distinct from true then raise exception '%', message; end if;
end; $$;

select pg_temp.assert_true(not has_function_privilege('anon', 'public.search_chat_talks(text,uuid,uuid,uuid,integer)', 'execute'), 'Anonymous search is forbidden');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.reserve_chat_run(uuid,uuid,integer)', 'execute'), 'Users cannot write quota reservations');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'private.reserve_chat_run(uuid,uuid,integer)', 'execute'), 'Private ledger cannot be called by users');

-- Stale but valid JWTs must lose access immediately when approval is removed.
select set_config('request.jwt.claims', jsonb_build_object('sub', speaker_id, 'email', organizer_email, 'role', 'authenticated')::text, true) from stats_fixture;
grant select on stats_fixture to authenticated;
set local role authenticated;
select pg_temp.assert_true(public.can_current_user_chat(), 'Approved user can chat');
select pg_temp.assert_true(jsonb_array_length(public.search_chat_talks('signals regression sentinel')->'items') = 2, 'Only public talks returned, including ten-year-old talk');
select pg_temp.assert_true(jsonb_array_length(public.search_chat_talks('signals', p_speaker_id => (select speaker_id from stats_fixture))->'items') = 2, 'Speaker filter works');
select pg_temp.assert_true(jsonb_array_length(public.search_chat_talks('', p_event_id => (select past_event_id from stats_fixture))->'items') = 1, 'Historical event filter works');
select pg_temp.assert_true(jsonb_array_length(public.search_chat_talks('', p_talk_id => (select private_talk_id from stats_fixture))->'items') = 0, 'Private talk details never leak');
select pg_temp.assert_true(jsonb_array_length(public.search_chat_talks('', p_talk_id => (select unassigned_talk_id from stats_fixture))->'items') = 0, 'Unassigned talks never leak');
select pg_temp.assert_true(jsonb_array_length(public.find_chat_entities('speakers','Stats Hidden')->'items') = 0, 'Private speakers never leak');
select pg_temp.assert_true(jsonb_array_length(public.find_chat_entities('events','Stats test')->'items') = 3, 'Event discovery only returns public events');
select pg_temp.assert_true(position('created_by' in public.search_chat_talks('signals regression sentinel')::text) = 0, 'Search does not return creator data');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.get_chat_speaker_archive(text,uuid,integer)', 'execute'), 'Anonymous speaker archive forbidden');
select pg_temp.assert_true((public.get_chat_speaker_archive('Public Stats')->'stats'->>'past')::integer = 1, 'Speaker name tokens work in either order and past count excludes future events');
select pg_temp.assert_true((public.get_chat_speaker_archive('Stats Public')->'stats'->>'upcoming')::integer = 1, 'Upcoming talks counted separately');
select pg_temp.assert_true(jsonb_array_length(public.get_chat_speaker_archive('Stats Hidden')->'speakers') = 0, 'Private speaker statistics never leak');
-- Combined filters share the same published-only approval boundary.
select pg_temp.assert_true(not has_function_privilege('anon', 'public.query_chat_archive(text,text,uuid,uuid,integer,integer,text,integer)', 'execute'), 'Anonymous combined query forbidden');
select pg_temp.assert_true((public.query_chat_archive(p_mode => 'stats', p_query => 'signals', p_speaker_id => (select speaker_id from stats_fixture), p_period => 'past')->>'total')::int = 1, 'Combined count excludes future and private talks');
select pg_temp.assert_true((public.query_chat_archive(p_query => 'signals', p_speaker_id => (select speaker_id from stats_fixture), p_from_year => extract(year from now() - interval '10 years')::int, p_to_year => extract(year from now() - interval '10 years')::int)->>'total')::int = 1, 'Inclusive year bounds include historical talks');
select pg_temp.assert_true((public.query_chat_archive(p_query => 'signals', p_event_id => (select private_event_id from stats_fixture))->>'total')::int = 0, 'Combined query never reveals a private event');
select pg_temp.assert_true((public.query_chat_archive(p_query => 'signals', p_speaker_id => (select speaker_id from stats_fixture), p_offset => 10)->>'total')::int = 2, 'Combined count is independent of pagination');
select pg_temp.assert_true(jsonb_array_length(public.query_chat_archive(p_speaker_id => (select speaker_id from stats_fixture), p_offset => 10)->'items') = 0, 'Combined empty page preserves total');
select pg_temp.assert_true((public.query_chat_archive(p_mode => 'ranking', p_query => 'signals', p_speaker_id => (select speaker_id from stats_fixture))->'items'->0->>'talkCount')::int = 1, 'Filtered ranking counts only matching past talks');
do $$ begin
  perform public.query_chat_archive(p_from_year => 2024, p_to_year => 2023);
  raise exception 'Reversed year bounds accepted';
exception when invalid_parameter_value then null; end $$;

reset role;
with inserted as (
  insert into public."Talks" (id, title, description, event_id, created_by)
  select gen_random_uuid(), 'Pagination count sentinel', 'Archive count fixture', past_event_id, 'stats-test'
  from stats_fixture cross join generate_series(1, 12) returning id
)
insert into public."SpeakerOnTalk" (speaker_id, talk_id)
select speaker_id, inserted.id from stats_fixture cross join inserted;
set local role authenticated;
select pg_temp.assert_true((public.get_chat_speaker_archive('Stats Public')->'stats'->>'total')::integer = 14, 'Total is not truncated to a page');
select pg_temp.assert_true(jsonb_array_length(public.get_chat_speaker_archive('Stats Public')->'page'->'items') = 10, 'First speaker page bounded');
select pg_temp.assert_true(jsonb_array_length(public.get_chat_speaker_archive('Stats Public', p_offset => 10)->'page'->'items') = 4, 'Next speaker page returns remaining talks');
select pg_temp.assert_true((select sum((y->>'past')::integer + (y->>'upcoming')::integer) from jsonb_array_elements(public.get_chat_speaker_archive('Stats Public')->'stats'->'years') y) = 14, 'Year counts cover all talks');
reset role;
-- Give the fixture speaker more past talks than any pre-existing speaker.
with baseline as (
  select coalesce(max(total), 0)::integer as maximum from (
    select count(distinct t.id) as total from public."SpeakerOnTalk" st
    join public."Talks" t on t.id = st.talk_id join public."Events" e on e.id = t.event_id
    where e.public = true and e.starts_at <= now() group by st.speaker_id
  ) c
), inserted as (
  insert into public."Talks" (id, title, description, event_id, created_by)
  select gen_random_uuid(), 'Ranking fixture', 'Past public talk', past_event_id, 'stats-test'
  from stats_fixture cross join baseline cross join lateral generate_series(1, maximum) returning id
)
insert into public."SpeakerOnTalk" (speaker_id, talk_id)
select speaker_id, inserted.id from stats_fixture cross join inserted;
set local role authenticated;
select pg_temp.assert_true(not has_function_privilege('anon', 'public.rank_chat_speakers(integer)', 'execute'), 'Anonymous ranking forbidden');
select pg_temp.assert_true((public.rank_chat_speakers()->'items'->0->>'id')::uuid = (select speaker_id from stats_fixture), 'Ranking finds the leader over the whole archive');
select pg_temp.assert_true((public.rank_chat_speakers()->>'highestCount')::integer = (public.get_chat_speaker_archive('Stats Public')->'stats'->>'past')::integer, 'Ranking uses exact past counts, not a ten-item page or upcoming totals');
select pg_temp.assert_true((public.rank_chat_speakers()->>'leaderCount')::integer = 1, 'One leader before co-presenter fixture');
select pg_temp.assert_true(position((select hidden_speaker_id::text from stats_fixture) in public.rank_chat_speakers()::text) = 0, 'Private-only speakers excluded from ranking');
reset role;
-- Co-presenting all the same past talks creates an exact tie. Extra unpublished
-- and future talks for this person must not break the tie.
insert into public."SpeakerOnTalk" (speaker_id, talk_id)
select f.hidden_speaker_id, st.talk_id from stats_fixture f
join public."SpeakerOnTalk" st on st.speaker_id = f.speaker_id;
with inserted as (
  insert into public."People" (id, first_name, last_name, slug)
  select gen_random_uuid(), 'Ranking', n::text, gen_random_uuid()::text from generate_series(1, 11) n
  returning id
)
insert into public."SpeakerOnTalk" (speaker_id, talk_id)
select inserted.id, past_talk_id from stats_fixture cross join inserted;
set local role authenticated;
select pg_temp.assert_true((public.rank_chat_speakers()->>'leaderCount')::integer = 2, 'Tied winners preserved, private and upcoming talks excluded');
select pg_temp.assert_true((public.rank_chat_speakers()->'items'->0->>'rank')::integer = 1 and (public.rank_chat_speakers()->'items'->1->>'rank')::integer = 1, 'Both co-presenters have rank one');
select pg_temp.assert_true(jsonb_array_length(public.rank_chat_speakers()->'items') = 10 and (public.rank_chat_speakers()->>'hasMore')::boolean, 'Ranking pages bounded without truncating aggregates');
select pg_temp.assert_true(not exists (select 1 from jsonb_array_elements(public.rank_chat_speakers()->'items') a join jsonb_array_elements(public.rank_chat_speakers(10)->'items') b on a->>'id' = b->>'id'), 'Ranking pages do not overlap');
select pg_temp.assert_true(public.rank_chat_speakers()->>'highestCount' = public.rank_chat_speakers(10)->>'highestCount', 'Global aggregates stable across pages');
do $$ begin
  perform public.rank_chat_speakers(-1);
  raise exception 'Invalid offset accepted';
exception when invalid_parameter_value then null;
end; $$;
reset role;
update private.allowed_google_accounts set active = false where email = (select organizer_email from stats_fixture);
set local role authenticated;
select pg_temp.assert_true(not public.can_current_user_chat(), 'Revocation takes effect without token refresh');
do $$ begin
  perform public.query_chat_archive();
  raise exception 'Revoked user queried filtered archive';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.rank_chat_speakers();
  raise exception 'Revoked user read rankings';
exception when insufficient_privilege then null;
end; $$;
do $$ begin
  perform public.get_chat_speaker_archive('Stats Public');
  raise exception 'Revoked user searched the archive';
exception when insufficient_privilege then null;
end; $$;
reset role;
update private.allowed_google_accounts set active = true where email = (select organizer_email from stats_fixture);
insert into auth.users(id, email) select speaker_id, organizer_email from stats_fixture;

-- Quota tests use the real service-only entry point, with fixtures rolled back.
select pg_temp.assert_true(public.reserve_chat_run(speaker_id, past_talk_id, 1000000) = 'ok', 'First reservation succeeds') from stats_fixture;
select pg_temp.assert_true(public.reserve_chat_run(speaker_id, past_talk_id, 1000000) = 'duplicate', 'Run IDs are idempotent') from stats_fixture;
select pg_temp.assert_true(public.reserve_chat_run(speaker_id, future_talk_id, 1000000) = 'busy', 'Only one concurrent run per user') from stats_fixture;
select public.finish_chat_run(speaker_id, past_talk_id) from stats_fixture;
select pg_temp.assert_true(public.reserve_chat_run(speaker_id, future_talk_id, 0) = 'budget_limit', 'Global budget fails closed') from stats_fixture;
insert into private.chat_runs(run_id, user_id, finished_at)
select gen_random_uuid(), speaker_id, now() from stats_fixture cross join generate_series(1,4);
select pg_temp.assert_true(public.reserve_chat_run(speaker_id, future_talk_id, 1000000) = 'minute_limit', 'Five-per-minute cap works') from stats_fixture;
update private.chat_runs set started_at = now() - interval '3 minutes' where user_id = (select speaker_id from stats_fixture);
-- Place all daily fixtures after UTC midnight, even when tests run just after midnight.
update private.chat_runs set started_at = date_trunc('day', now() at time zone 'UTC') at time zone 'UTC' where user_id = (select speaker_id from stats_fixture);
insert into private.chat_runs(run_id, user_id, started_at, finished_at)
select gen_random_uuid(), speaker_id, date_trunc('day', now() at time zone 'UTC') at time zone 'UTC', now() from stats_fixture cross join generate_series(1,25);
select pg_temp.assert_true(public.reserve_chat_run(speaker_id, future_talk_id, 1000000) in ('daily_limit','minute_limit'), 'Thirty-per-day cap works') from stats_fixture;
rollback;
select 'chat access, historical search, revocation and quota checks passed; fixtures rolled back' as result;

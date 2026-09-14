-- Run as postgres against a migrated database:
-- supabase db query --linked --file supabase/tests/public_access.sql
-- Every fixture and temporary helper is rolled back, including on failure.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function pg_temp.assert_access(ok boolean, message text)
returns void language plpgsql as $$
begin
  if ok is distinct from true then
    raise exception 'Access regression: %', message;
  end if;
end;
$$;

create temporary table access_fixture on commit drop as
select gen_random_uuid() as person_id, gen_random_uuid() as venue_id,
  gen_random_uuid() as public_event_id, gen_random_uuid() as private_event_id,
  gen_random_uuid() as public_talk_id, gen_random_uuid() as private_talk_id,
  gen_random_uuid() as unassigned_talk_id,
  'rls-test-' || gen_random_uuid()::text || '@gmail.com' as organizer_email;
grant select on access_fixture to anon, authenticated, service_role;

insert into private.allowed_google_accounts (email, active, first_name, last_name)
select organizer_email, true, 'Access', 'Test' from access_fixture;

insert into public."People" (id, first_name, last_name, slug, email)
select person_id, 'Access', 'Test', person_id::text, 'private-contact@example.invalid'
from access_fixture;
insert into public."PeopleOnRoles" (person_id, role)
select person_id, 'ORGANIZER'::public."ROLES" from access_fixture;

insert into public."Venues" (id, title, street, city, zip, latitude, longitude, created_by)
select venue_id, 'Access test', 'Test', 'Test', '0000', 0, 0, 'access-test'
from access_fixture;
insert into public."Events" (id, title, meetup_url, starts_at, venue_id, slug, public)
select public_event_id, 'Public test', 'https://example.invalid', now(), venue_id,
  public_event_id::text, true from access_fixture
union all
select private_event_id, 'Private test', 'https://example.invalid', now(), venue_id,
  private_event_id::text, false from access_fixture;
insert into public."Talks" (id, title, description, event_id, created_by)
select public_talk_id, 'Public test', 'Test', public_event_id, 'access-test' from access_fixture
union all
select private_talk_id, 'Private test', 'Test', private_event_id, 'access-test' from access_fixture
union all
select unassigned_talk_id, 'Unassigned test', 'Test', null, 'access-test' from access_fixture;
insert into public."SpeakerOnTalk" (speaker_id, talk_id)
select person_id, public_talk_id from access_fixture
union all select person_id, private_talk_id from access_fixture
union all select person_id, unassigned_talk_id from access_fixture;

-- Shared checks run with the caller's permissions, never SECURITY DEFINER.
create function pg_temp.check_reader(is_organizer boolean)
returns void language plpgsql as $$
declare
  visible_count integer;
begin
  perform pg_temp.assert_access(
    not has_column_privilege(current_user, 'public."People"', 'email', 'SELECT'),
    current_user || ' cannot select contact email');
  begin
    perform email from public."People";
    raise exception 'Email SELECT unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform id from public."People" where email = 'private-contact@example.invalid';
    raise exception 'Email filter unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public."People";
    raise exception 'Wildcard SELECT unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  perform pg_temp.assert_access(
    (select count(*) = 1 from public."People" p join access_fixture f on p.id = f.person_id),
    'public profile row remains visible');
  perform id, first_name, last_name, slug, abstract, personal_url, twitter_url,
    linkedin_url, github_url, picture_url, created_at, label, company_name
  from public."People";
  perform * from public.organizers_public;
  perform * from public.former_organizers_public;

  select count(*) into visible_count from public."Talks" t cross join access_fixture f
  where t.id in (f.public_talk_id, f.private_talk_id, f.unassigned_talk_id);
  perform pg_temp.assert_access(visible_count = case when is_organizer then 3 else 1 end,
    'talk visibility matches publication and organizer access');
  select count(*) into visible_count from public."SpeakerOnTalk" s cross join access_fixture f
  where s.speaker_id = f.person_id;
  perform pg_temp.assert_access(visible_count = case when is_organizer then 3 else 1 end,
    'speaker assignments follow talk visibility');

  -- Exercise the public page's joined profile query after column restrictions.
  select count(*) into visible_count
  from public."Events" e
  join public."Talks" t on t.event_id = e.id
  join public."SpeakerOnTalk" s on s.talk_id = t.id
  join public."People" p on p.id = s.speaker_id
  join access_fixture f on f.public_event_id = e.id;
  perform pg_temp.assert_access(visible_count = 1, 'public event/speaker join works');

  perform pg_temp.assert_access(
    not has_table_privilege(current_user, 'public."People"', 'INSERT')
    and not has_table_privilege(current_user, 'public."People"', 'UPDATE')
    and not has_table_privilege(current_user, 'public."People"', 'DELETE'),
    'browser roles cannot modify people');
end;
$$;

set local role anon;
select pg_temp.check_reader(false);
reset role;

-- A signed-in outsider and user-editable organizer claims grant no extra access.
set local request.jwt.claims = '{"email":"outsider@example.invalid","role":"authenticated","user_metadata":{"role":"organizer"}}';
set local role authenticated;
select pg_temp.check_reader(false);
select pg_temp.assert_access(
  (select count(*) = 0 from public.organizer_talk_submissions),
  'signed-in outsider cannot read submission contacts');
reset role;

-- Use a transaction-only allowlisted identity, without creating an Auth account.
do $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('email', organizer_email, 'role', 'authenticated')::text, true)
  from access_fixture;
end;
$$;
set local role authenticated;
select pg_temp.check_reader(true);
select pg_temp.assert_access(private.can_current_user_read_talk_submissions(),
  'allowlisted organizer is authorized');
-- Existing organizer contacts remain queryable. Do not print personal data.
do $$ begin perform speaker_email from public.organizer_talk_submissions; end; $$;
reset role;

set local role service_role;
select pg_temp.assert_access(
  (select count(*) = 1 from public."People" p join access_fixture f on p.id = f.person_id
    where p.email = 'private-contact@example.invalid'),
  'service role retains contact access for privileged workflows');
reset role;

rollback;
select 'public access regression checks passed; fixtures rolled back' as result;

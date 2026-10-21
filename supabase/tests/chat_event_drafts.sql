begin;
set local statement_timeout='30s';
create function pg_temp.check_true(ok boolean, message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%',message; end if;
end $$;
create temporary table draft_fixture as select gen_random_uuid() as uid,gen_random_uuid() as thread,
  gen_random_uuid() as venue,gen_random_uuid() as speaker,gen_random_uuid() as talk1,gen_random_uuid() as talk2,
  'draft-test-'||gen_random_uuid()::text||'@gmail.com' as email, null::jsonb as draft;
grant all on draft_fixture to authenticated,service_role;
insert into auth.users(id,email) select uid,email from draft_fixture;
insert into private.allowed_google_accounts(email,active,first_name,last_name) select email,true,'Draft','Tester' from draft_fixture;
insert into public."People"(id,first_name,last_name,slug) select speaker,'Draft','Speaker',speaker::text from draft_fixture;
insert into public."Venues"(id,title,street,city,zip,latitude,longitude,created_by)
  select venue,'Draft venue','Test street','Zürich','8005',0,0,'test' from draft_fixture;
select pg_temp.check_true(not has_table_privilege('anon','public.chat_event_drafts','select'),'Anonymous draft reads denied');
select pg_temp.check_true(not has_table_privilege('authenticated','public.chat_event_drafts','update'),'Direct state changes denied');
select pg_temp.check_true(not has_function_privilege('authenticated','public.save_chat_event_draft(uuid,integer,uuid)','execute'),'Caller token cannot bypass server approval');
select set_config('request.jwt.claims',jsonb_build_object('sub',uid,'email',email,'role','authenticated')::text,true) from draft_fixture;
set local role authenticated;
update draft_fixture set draft=public.mutate_chat_event_draft('create',null,null,jsonb_build_object(
  'title','Private draft test','description','Reviewed description','startsAt','2099-11-12T18:00',
  'venueId',venue,'meetupUrl','https://www.meetup.com/example/events/123/','threadId',thread,'requestKey','first'));
select pg_temp.check_true((select draft->>'state'='draft' and (draft->>'version')::int=1 from draft_fixture),'Private initial state');
select pg_temp.check_true((select public.mutate_chat_event_draft('create',null,null,jsonb_build_object(
  'title','Private draft test','threadId',thread,'requestKey','first'))->>'id'=draft->>'id' from draft_fixture),'Creation retry reuses ID');
update draft_fixture set draft=public.mutate_chat_event_draft('create_talk',(draft->>'id')::uuid,1,
  jsonb_build_object('talkId',talk1,'title','Drafted talk one','description','Safe plain text description.','speakerIds',jsonb_build_array(speaker)));
update draft_fixture set draft=public.mutate_chat_event_draft('create_talk',(draft->>'id')::uuid,2,
  jsonb_build_object('talkId',talk2,'title','Drafted talk two','description','Another draft description.','speakerIds',jsonb_build_array(speaker)));
do $$ begin
  perform public.mutate_chat_event_draft('update',(draft->>'id')::uuid,1,'{"title":"Stale edit"}') from draft_fixture;
  raise exception 'Stale version accepted';
exception when serialization_failure then null; end $$;
do $$ begin
  perform public.mutate_chat_event_draft('update',(draft->>'id')::uuid,null,'{"title":"Missing version"}') from draft_fixture;
  raise exception 'Null version accepted';
exception when serialization_failure then null; end $$;
do $$ begin
  perform public.mutate_chat_event_draft('create_talk',(draft->>'id')::uuid,3,jsonb_build_object('talkId',talk1,'title','Duplicate talk','description','Test','speakerIds',jsonb_build_array(speaker))) from draft_fixture;
  raise exception 'Duplicate talk accepted';
exception when invalid_parameter_value then null; end $$;
select pg_temp.check_true((select count(*)=3 from public.chat_event_draft_audit where draft_id=(select (draft->>'id')::uuid from draft_fixture)),'Audit records every successful edit only');
reset role;
select pg_temp.check_true(not exists(select 1 from public."Events" where title='Private draft test'),'Nothing public before confirmation');
update private.allowed_google_accounts set active=false where email=(select email from draft_fixture);
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.chat_event_drafts),'Revocation hides drafts');
do $$ begin
  perform public.mutate_chat_event_draft('discard',(draft->>'id')::uuid,3,'{}') from draft_fixture;
  raise exception 'Revoked user edited draft';
exception when insufficient_privilege then null; end $$;
reset role;
update private.allowed_google_accounts set active=true where email=(select email from draft_fixture);
set local role service_role;
do $$ begin
  perform public.save_chat_event_draft((draft->>'id')::uuid,2,uid) from draft_fixture;
  raise exception 'Stale approval published';
exception when serialization_failure then null; end $$;
update draft_fixture set draft=public.save_chat_event_draft((draft->>'id')::uuid,3,uid);
select pg_temp.check_true((select draft->>'state'='saved' from draft_fixture),'Draft event saved after review');
select pg_temp.check_true((select public.save_chat_event_draft((draft->>'id')::uuid,3,uid)->>'event_id'=draft->>'event_id' from draft_fixture),'Save retry reuses event');
reset role;
select pg_temp.check_true((select count(*)=1 from public."Events" where id=(select (draft->>'event_id')::uuid from draft_fixture) and public=false and description='Reviewed description'),'Exactly one private Draft event');
grant select on draft_fixture to anon;
set local role anon;
select pg_temp.check_true(not exists(select 1 from public."Events" where id=(select (draft->>'event_id')::uuid from draft_fixture)),'Saved draft event hidden from anonymous visitors');
reset role;
select pg_temp.check_true((select count(*)=2 from public."Talks" where event_id=(select (draft->>'event_id')::uuid from draft_fixture)),'Both talks assigned atomically');
select pg_temp.check_true(exists(select 1 from public."PeopleOnRoles" where person_id=(select speaker from draft_fixture) and role='SPEAKER'),'New talk speakers receive the speaker role');
select pg_temp.check_true((select count(*)=1 from public.chat_event_draft_audit where action='save_event' and actor_id=(select uid from draft_fixture)),'Draft save attributed once');
set local role authenticated;
do $$ begin
  perform public.mutate_chat_event_draft('discard',(draft->>'id')::uuid,4,'{}') from draft_fixture;
  raise exception 'Published event discarded';
exception when serialization_failure then null; end $$;
reset role;
-- Existing approved talks remain unassigned while drafting and are rechecked on publication.
create temporary table existing_fixture as select gen_random_uuid() as submission,
  gen_random_uuid() as talk, null::jsonb as draft;
grant all on existing_fixture to authenticated,service_role;
insert into submissions.talk_submissions(id,talk_title,talk_description,speaker_name,speaker_email,speaker_bio,slides_url)
  select submission,'Approved fixture talk',repeat('A talk description. ',4),'Draft Speaker',
    'synthetic@example.com',repeat('A speaker biography. ',3),'https://example.com/slides' from existing_fixture;
update submissions.talk_submissions set status='approved' where id=(select submission from existing_fixture);
insert into public."Talks"(id,title,description,source_talk_submission_id,created_by)
  select talk,'Approved fixture talk',repeat('A talk description. ',4),submission,'test' from existing_fixture;
insert into public."SpeakerOnTalk"(speaker_id,talk_id) select speaker,talk from draft_fixture cross join existing_fixture;
set local role authenticated;
update existing_fixture set draft=public.mutate_chat_event_draft('create',null,null,
  (select jsonb_build_object('title','Existing talk draft','startsAt','2099-11-12T18:00','venueId',venue,
    'meetupUrl','https://www.meetup.com/example/events/123/','threadId',thread,'requestKey','existing') from draft_fixture));
update existing_fixture set draft=public.mutate_chat_event_draft('attach',(draft->>'id')::uuid,1,jsonb_build_object('talkId',talk));
update existing_fixture set draft=public.mutate_chat_event_draft('create_talk',(draft->>'id')::uuid,2,
  (select jsonb_build_object('talkId',gen_random_uuid(),'title','Another new talk','description','A new draft talk.',
    'speakerIds',jsonb_build_array(speaker)) from draft_fixture));
reset role;
select pg_temp.check_true((select event_id is null from public."Talks" where id=(select talk from existing_fixture)),'Draft attachment does not assign a live talk');
update public."Talks" set title='Changed since review' where id=(select talk from existing_fixture);
set local role service_role;
do $$ begin
  perform public.save_chat_event_draft((e.draft->>'id')::uuid,3,f.uid) from existing_fixture e cross join draft_fixture f;
  raise exception 'Changed source talk was published';
exception when serialization_failure then null; end $$;
reset role;
select pg_temp.check_true(not exists(select 1 from public."Events" where title='Existing talk draft'),'Failed publication rolls back event insertion');
update public."Talks" set title='Approved fixture talk' where id=(select talk from existing_fixture);
set local role service_role;
update existing_fixture set draft=public.save_chat_event_draft((draft->>'id')::uuid,3,(select uid from draft_fixture));
reset role;
select pg_temp.check_true((select t.event_id=(e.draft->>'event_id')::uuid from public."Talks" t join existing_fixture e on t.id=e.talk),'Approved talk assigned to published event');
select pg_temp.check_true((select status='assigned_to_event' from submissions.talk_submissions where id=(select submission from existing_fixture)),'Submission assignment status updated');
rollback;

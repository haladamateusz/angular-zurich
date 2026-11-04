-- Run after migrations as postgres. Fixtures and all changes are rolled back.
begin;
set local statement_timeout='30s';
create temporary table history_fixture as select gen_random_uuid() as owner,gen_random_uuid() as other,
  gen_random_uuid() as thread,gen_random_uuid() as run,gen_random_uuid() as question,gen_random_uuid() as draft,
  'history-'||gen_random_uuid()::text||'@gmail.com' as email;
insert into auth.users(id,email) select owner,email from history_fixture union all select other,'other-'||email from history_fixture;
insert into private.allowed_google_accounts(email,active,first_name,last_name) select email,true,'History','Owner' from history_fixture union all select 'other-'||email,true,'History','Other' from history_fixture;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception '%',message; end if; end $$;
select pg_temp.assert_true(not has_function_privilege('authenticated','public.chat_history(uuid,text,jsonb)','execute'),'Browser cannot call persistence RPC');
select pg_temp.assert_true(not has_function_privilege('anon','public.chat_history(uuid,text,jsonb)','execute'),'Anonymous cannot call persistence RPC');
select pg_temp.assert_true(not has_table_privilege('authenticated','private.chat_messages','select'),'Browser cannot read private messages');
select pg_temp.assert_true((public.chat_history(owner,'begin',jsonb_build_object('threadId',thread,'runId',run,'questionId',question,'question','Find signals talks','revision',0,'budget',1000000))->>'code')='ok','First turn accepted') from history_fixture;
select pg_temp.assert_true((select count(*) from private.chat_messages where thread_id=f.thread)=2,'Question and placeholder persisted together') from history_fixture f;
select pg_temp.assert_true((public.chat_history(owner,'begin',jsonb_build_object('threadId',thread,'runId',run,'questionId',question,'question','Find signals talks','revision',0,'budget',1000000))->>'code')='duplicate','Duplicate is idempotent') from history_fixture;
select pg_temp.assert_true((select count(*) from private.chat_runs where run_id=f.run)=1,'Duplicate reserves quota only once') from history_fixture f;
do $$ declare f record; begin select * into f from history_fixture;
  begin perform public.chat_history(f.other,'get',jsonb_build_object('threadId',f.thread)); raise exception 'Other user read conversation'; exception when no_data_found then null; end;
  begin perform public.chat_history(f.other,'delete',jsonb_build_object('threadId',f.thread)); raise exception 'Other user deleted conversation'; exception when no_data_found then null; end;
  begin perform public.chat_history(f.owner,'delete',jsonb_build_object('threadId',f.thread)); raise exception 'Deleted a running conversation'; exception when serialization_failure then null; end;
end $$;
select public.chat_history(owner,'checkpoint',jsonb_build_object('threadId',thread,'runId',run,'checkpoint',2,'status','running','text','Saved partial answer','payload','{}'::jsonb,'context','{"speakers":[],"events":[]}'::jsonb)) from history_fixture;
select public.chat_history(owner,'checkpoint',jsonb_build_object('threadId',thread,'runId',run,'checkpoint',1,'status','running','text','Stale answer','payload','{}'::jsonb)) from history_fixture;
select pg_temp.assert_true((select text from private.chat_messages where thread_id=f.thread and role='assistant')='Saved partial answer','Late checkpoints cannot overwrite progress') from history_fixture f;
select public.chat_history(owner,'stop',jsonb_build_object('threadId',thread,'runId',run)) from history_fixture;
select pg_temp.assert_true((public.chat_history(owner,'checkpoint',jsonb_build_object('threadId',thread,'runId',run,'checkpoint',3,'status','complete','text','Too late','payload','{}'::jsonb))->>'stopped')::boolean,'Stop rejects later completion') from history_fixture;
select public.chat_history(owner,'release',jsonb_build_object('threadId',thread,'runId',run)) from history_fixture;
select pg_temp.assert_true((select status from private.chat_messages where thread_id=f.thread and role='assistant')='stopped','Stopped response preserved') from history_fixture f;
select pg_temp.assert_true((public.chat_history(owner,'rename',jsonb_build_object('threadId',thread,'title','My saved chat','revision',1))->>'title')='My saved chat','Rename works') from history_fixture;
do $$ declare f record; begin select * into f from history_fixture;
  begin perform public.chat_history(f.owner,'begin',jsonb_build_object('threadId',f.thread,'runId',gen_random_uuid(),'questionId',gen_random_uuid(),'question','Follow up','revision',1,'budget',1000000)); raise exception 'Stale revision accepted'; exception when serialization_failure then null; end;
end $$;
-- The draft association must survive a failed model call before presentation.
insert into public.chat_event_drafts(id,created_by,thread_id,request_key,content)
  select draft,owner,thread,'history-recovery','{}'::jsonb from history_fixture;
select pg_temp.assert_true((public.chat_history(owner,'get',jsonb_build_object('threadId',thread))->'context'->>'eventDraftId')=draft::text,'Draft trigger preserves context before presentation') from history_fixture;
select pg_temp.assert_true((select requires_organizer from private.chat_threads where id=f.thread),'Draft context requires organizer access') from history_fixture f;
-- A process can disappear without a final checkpoint. Reopening must recover
-- the last saved text and clear the expired lease without another model run.
update history_fixture set run=gen_random_uuid(),question=gen_random_uuid();
select pg_temp.assert_true((public.chat_history(owner,'begin',jsonb_build_object('threadId',thread,'runId',run,'questionId',question,'question','Continue planning','revision',2,'budget',1000000))->>'code')='ok','Follow-up accepted') from history_fixture;
select public.chat_history(owner,'checkpoint',jsonb_build_object('threadId',thread,'runId',run,'checkpoint',1,'status','running','text','Before process exit','payload','{}'::jsonb,'context','{}'::jsonb)) from history_fixture;
update private.chat_thread_state set lease_until=now()-interval '1 second' where thread_id=(select thread from history_fixture);
select pg_temp.assert_true((public.chat_history(owner,'get',jsonb_build_object('threadId',thread))->>'activeRun') is null,'Reopening releases expired runs') from history_fixture;
select pg_temp.assert_true((select status='interrupted' and text='Before process exit' from private.chat_messages where run_id=f.run and role='assistant'),'Interrupted run retains its last checkpoint') from history_fixture f;
select pg_temp.assert_true((public.chat_history(owner,'get',jsonb_build_object('threadId',thread))->'context'->>'eventDraftId')=draft::text,'A later checkpoint cannot erase the recovered draft') from history_fixture;
update private.allowed_google_accounts set active=false where email=(select email from history_fixture);
do $$ declare f record; begin select * into f from history_fixture;
  begin perform public.chat_history(f.owner,'get',jsonb_build_object('threadId',f.thread)); raise exception 'Revoked user read conversation'; exception when insufficient_privilege then null; end;
end $$;
update private.allowed_google_accounts set active=true where email=(select email from history_fixture);
insert into public.chat_feedback(user_id,thread_id,message_id,question,answer,rating,saved_thread_id) select owner,thread,gen_random_uuid(),'Question','Answer','useful',thread from history_fixture;
select public.chat_history(owner,'delete',jsonb_build_object('threadId',thread)) from history_fixture;
select pg_temp.assert_true(not exists(select 1 from private.chat_messages where thread_id=f.thread),'Delete removes messages') from history_fixture f;
select pg_temp.assert_true(not exists(select 1 from public.chat_feedback where thread_id=f.thread),'Delete removes feedback copies') from history_fixture f;
select pg_temp.assert_true(exists(select 1 from public.chat_event_drafts where id=f.draft),'Delete preserves the independent event draft') from history_fixture f;
do $$ declare f record; begin select * into f from history_fixture;
  begin perform public.chat_history(f.owner,'checkpoint',jsonb_build_object('threadId',f.thread,'runId',f.run,'checkpoint',4,'status','complete','text','Resurrection','payload','{}'::jsonb)); raise exception 'Deleted chat resurrected'; exception when no_data_found then null; end;
end $$;
rollback;

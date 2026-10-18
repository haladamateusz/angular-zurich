-- Run as postgres after migrations. No fixtures survive this transaction.
begin;
set local statement_timeout = '30s';
create temporary table feedback_fixture on commit drop as
select gen_random_uuid() as user_id, gen_random_uuid() as other_user_id,
  gen_random_uuid() as message_id, gen_random_uuid() as thread_id,
  'feedback-' || gen_random_uuid()::text || '@gmail.com' as email;
grant select on feedback_fixture to authenticated;
insert into auth.users (id, email)
select user_id, email from feedback_fixture
union all select other_user_id, 'other-' || email from feedback_fixture;
insert into private.allowed_google_accounts (email, active, first_name, last_name)
select email, true, 'Feedback', 'Test' from feedback_fixture
union all select 'other-' || email, true, 'Other', 'Test' from feedback_fixture;

create function pg_temp.assert_true(value boolean, message text)
returns void language plpgsql as $$ begin
  if value is distinct from true then raise exception '%', message; end if;
end; $$;

select pg_temp.assert_true(not has_table_privilege('anon', 'public.chat_feedback', 'select'), 'Anonymous feedback reads denied');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.chat_feedback', 'insert'), 'Anonymous feedback inserts denied');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.chat_feedback', 'update'), 'Anonymous feedback updates denied');
select pg_temp.assert_true(not has_table_privilege('anon', 'public.chat_feedback', 'delete'), 'Anonymous feedback deletes denied');

select set_config('request.jwt.claims', jsonb_build_object('sub', user_id, 'email', email, 'role', 'authenticated')::text, true) from feedback_fixture;
set local role authenticated;
insert into public.chat_feedback (user_id, message_id, thread_id, question, answer, rating)
select user_id, message_id, thread_id, 'Signals?', 'Here are the talks.', 'useful' from feedback_fixture;
insert into public.chat_feedback (user_id, message_id, thread_id, question, answer, rating)
select user_id, message_id, thread_id, 'Signals?', 'Here are the talks.', 'not_quite' from feedback_fixture
on conflict (user_id, message_id) do update set rating = excluded.rating;
select pg_temp.assert_true((select count(*) = 1 and min(rating) = 'not_quite' from public.chat_feedback), 'Repeated feedback updates one row');

do $$ begin
  insert into public.chat_feedback (user_id, message_id, thread_id, question, answer, rating)
  select other_user_id, message_id, thread_id, 'Spoof?', 'No.', 'useful' from feedback_fixture;
  raise exception 'Identity spoof accepted';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.chat_feedback set user_id = (select other_user_id from feedback_fixture);
  raise exception 'Ownership transfer accepted';
exception when insufficient_privilege then null; end $$;
do $$ begin
  update public.chat_feedback set rating = 'invalid';
  raise exception 'Invalid rating accepted';
exception when check_violation then null; end $$;
do $$ begin
  update public.chat_feedback set question = repeat('x', 2001);
  raise exception 'Oversized question accepted';
exception when check_violation then null; end $$;

-- A second approved user cannot see, overwrite, or delete the first user's row.
reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', other_user_id, 'email', 'other-' || email, 'role', 'authenticated')::text, true) from feedback_fixture;
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.chat_feedback), 'Other user cannot read feedback');
with changed as (update public.chat_feedback set rating = 'useful' returning *)
select pg_temp.assert_true((select count(*) = 0 from changed), 'Other user cannot update feedback');
with removed as (delete from public.chat_feedback returning *)
select pg_temp.assert_true((select count(*) = 0 from removed), 'Other user cannot delete feedback');

reset role;
select set_config('request.jwt.claims', jsonb_build_object('sub', user_id, 'email', email, 'role', 'authenticated')::text, true) from feedback_fixture;
update private.allowed_google_accounts set active = false where email = (select email from feedback_fixture);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.chat_feedback), 'Revocation immediately removes read access');
do $$ begin
  insert into public.chat_feedback (user_id, message_id, thread_id, question, answer, rating)
  select user_id, gen_random_uuid(), thread_id, 'Revoked?', 'No.', 'useful' from feedback_fixture;
  raise exception 'Revoked user inserted feedback';
exception when insufficient_privilege then null; end $$;
with changed as (update public.chat_feedback set rating = 'useful' returning *)
select pg_temp.assert_true((select count(*) = 0 from changed), 'Revoked user cannot update feedback');
with removed as (delete from public.chat_feedback returning *)
select pg_temp.assert_true((select count(*) = 0 from removed), 'Revoked user cannot delete feedback');

reset role;
update private.allowed_google_accounts set active = true where email = (select email from feedback_fixture);
set local role authenticated;
delete from public.chat_feedback;
select pg_temp.assert_true((select count(*) = 0 from public.chat_feedback), 'Owner can remove feedback');
reset role;
rollback;

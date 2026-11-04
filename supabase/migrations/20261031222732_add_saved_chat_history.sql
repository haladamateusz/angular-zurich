-- History is accessible only through service-only RPCs after HTTP authentication.
-- Model tools continue to use the caller's JWT, never this persistence privilege.
create table private.chat_threads (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(title) between 1 and 100),
  revision integer not null default 0,
  requires_organizer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create index chat_threads_recent_idx on private.chat_threads(user_id, last_message_at desc, id desc);
create table private.chat_messages (
  id uuid primary key,
  thread_id uuid not null references private.chat_threads(id) on delete cascade,
  sequence integer not null,
  role text not null check (role in ('user','assistant')),
  text text not null default '' check (length(text) <= 12000),
  reply_to uuid references private.chat_messages(id) on delete cascade,
  run_id uuid not null,
  status text not null check (status in ('running','complete','stopped','interrupted','failed')),
  payload jsonb not null default '{}' check (octet_length(payload::text) <= 100000),
  checkpoint integer not null default 0,
  created_at timestamptz not null default now(),
  unique(thread_id, sequence),
  unique(run_id, role)
);
create table private.chat_thread_state (
  thread_id uuid primary key references private.chat_threads(id) on delete cascade,
  context jsonb not null default '{}' check (octet_length(context::text) <= 16000),
  active_run uuid,
  lease_until timestamptz,
  stop_requested boolean not null default false
);
alter table private.chat_threads enable row level security;
alter table private.chat_messages enable row level security;
alter table private.chat_thread_state enable row level security;
revoke all on private.chat_threads, private.chat_messages, private.chat_thread_state from public, anon, authenticated;
-- A FK makes deletion race safely with in-flight feedback writes.
alter table public.chat_feedback add column saved_thread_id uuid references private.chat_threads(id) on delete cascade;
create index chat_feedback_saved_thread_idx on public.chat_feedback(saved_thread_id);

create function private.chat_history(p_user_id uuid, p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  tid uuid := (p_data->>'threadId')::uuid;
  rid uuid := (p_data->>'runId')::uuid;
  t private.chat_threads;
  s private.chat_thread_state;
  result jsonb;
  quota text;
  seq integer;
  question text;
  initial_title text;
  message_id uuid;
  next_context jsonb;
begin
  -- This function is granted only to service_role; the HTTP server supplies the
  -- authenticated user. Check the live allowlist on every operation as well.
  if not exists (select 1 from auth.users u where u.id=p_user_id and private.is_allowed_google_account(u.email)) then
    raise exception 'history_forbidden' using errcode='42501';
  end if;
  if p_action = 'list' then
    select jsonb_build_object('items', coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)) into result
    from (select id, title, revision, last_message_at, requires_organizer from private.chat_threads
      where user_id=p_user_id and (p_data->>'beforeDate' is null or
        (last_message_at,id)<((p_data->>'beforeDate')::timestamptz,(p_data->>'beforeId')::uuid))
      order by last_message_at desc,id desc limit 31) r;
    return result;
  end if;
  -- Serialize a user's operations, including first creation and quota acceptance.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 72831));
  select * into t from private.chat_threads where id=tid for update;
  if found and t.user_id<>p_user_id then raise exception 'history_not_found' using errcode='P0002'; end if;
  if t.id is null and p_action<>'begin' then raise exception 'history_not_found' using errcode='P0002'; end if;
  if t.id is not null then
    select * into s from private.chat_thread_state where thread_id=tid for update;
    if s.active_run is not null and s.lease_until<=now() then
      update private.chat_messages set status='interrupted' where thread_id=tid and run_id=s.active_run and status='running';
      perform private.finish_chat_run(p_user_id,s.active_run);
      update private.chat_thread_state set active_run=null,lease_until=null where thread_id=tid;
      s.active_run := null;
    end if;
  end if;
  if p_action='begin' then
    question := btrim(p_data->>'question');
    if question is null or length(question) not between 1 and 2000 or rid is null or tid is null or p_data->>'questionId' is null then
      raise exception 'history_invalid' using errcode='22023';
    end if;
    if exists(select 1 from private.chat_messages where run_id=rid and thread_id=tid) then
      return jsonb_build_object('code','duplicate');
    end if;
    if coalesce(t.revision,0)<>(p_data->>'revision')::integer or p_data->>'revision' is null then
      raise exception 'history_conflict' using errcode='40001';
    end if;
    if s.active_run is not null then return jsonb_build_object('code','busy'); end if;
    quota := private.reserve_chat_run(p_user_id,rid,(p_data->>'budget')::integer);
    if quota<>'ok' then return jsonb_build_object('code',quota); end if;
    if t.id is null then
      initial_title := btrim(regexp_replace(question,'\s+',' ','g'));
      if length(initial_title)>100 then
        initial_title := coalesce(nullif(regexp_replace(left(initial_title,101),'\s+\S*$',''),''),left(initial_title,100));
        initial_title := left(initial_title,100);
      end if;
      insert into private.chat_threads(id,user_id,title) values(tid,p_user_id,initial_title);
      insert into private.chat_thread_state(thread_id) values(tid);
    end if;
    select coalesce(max(sequence),0)+1 into seq from private.chat_messages where thread_id=tid;
    message_id := gen_random_uuid();
    insert into private.chat_messages(id,thread_id,sequence,role,text,run_id,status) values
      ((p_data->>'questionId')::uuid,tid,seq,'user',question,rid,'complete');
    insert into private.chat_messages(id,thread_id,sequence,role,reply_to,run_id,status) values
      (message_id,tid,seq+1,'assistant',(p_data->>'questionId')::uuid,rid,'running');
    update private.chat_threads set revision=revision+1,last_message_at=now(),updated_at=now() where id=tid returning * into t;
    update private.chat_thread_state set active_run=rid,lease_until=now()+interval '2 minutes',stop_requested=false where thread_id=tid returning * into s;
    select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence),'[]'::jsonb) into result from
      (select role,text as content,sequence from private.chat_messages where thread_id=tid and role='user' order by sequence desc limit 6) r;
    return jsonb_build_object('code','ok','messageId',message_id,'revision',t.revision,'context',s.context,'messages',result);
  elsif p_action='get' then
    select coalesce(jsonb_agg(to_jsonb(r) order by r.sequence),'[]'::jsonb) into result from
      (select id,sequence,role,text,reply_to,run_id,status,payload,created_at from private.chat_messages
        where thread_id=tid and (p_data->>'before' is null or sequence<(p_data->>'before')::integer)
        order by sequence desc limit 41) r;
    return jsonb_build_object('thread',to_jsonb(t)-'user_id','messages',result,'context',s.context,'activeRun',s.active_run);
  elsif p_action='checkpoint' then
    if s.active_run is distinct from rid then return jsonb_build_object('stopped',true); end if;
    if s.stop_requested then return jsonb_build_object('stopped',true); end if;
    if p_data->>'status' not in ('running','complete','stopped','interrupted','failed') then raise exception 'history_invalid'; end if;
    update private.chat_messages set text=p_data->>'text',payload=p_data->'payload',status=p_data->>'status',checkpoint=(p_data->>'checkpoint')::integer
      where thread_id=tid and run_id=rid and role='assistant' and status='running' and checkpoint<(p_data->>'checkpoint')::integer;
    if found then
      if p_data->'context' is not null and p_data->'context'<>'null'::jsonb then
        next_context := p_data->'context';
        -- Draft creation is recorded by the draft trigger even before presentation.
        if s.context ? 'eventDraftId' and not next_context ? 'eventDraftId' then
          next_context := next_context || jsonb_build_object('eventDraftId',s.context->'eventDraftId');
        end if;
        update private.chat_thread_state set context=next_context where thread_id=tid;
      end if;
      update private.chat_threads set requires_organizer=requires_organizer or coalesce((p_data->>'organizer')::boolean,false) where id=tid;
      if p_data->>'status'<>'running' then
        update private.chat_thread_state set active_run=null,lease_until=null where thread_id=tid;
        perform private.finish_chat_run(p_user_id,rid);
      end if;
    end if;
    return jsonb_build_object('stopped',false);
  elsif p_action='stop' then
    if s.active_run=rid then
      update private.chat_messages set status='stopped' where thread_id=tid and run_id=rid and status='running';
      update private.chat_thread_state set stop_requested=true where thread_id=tid;
      -- Keep the lease until the executing request acknowledges cancellation.
    end if;
    return '{}'::jsonb;
  elsif p_action='release' then
    if s.active_run=rid then
      update private.chat_messages set status=case when s.stop_requested then 'stopped' else 'interrupted' end
        where thread_id=tid and run_id=rid and status='running';
      update private.chat_thread_state set active_run=null,lease_until=null where thread_id=tid;
      perform private.finish_chat_run(p_user_id,rid);
    end if;
    return '{}'::jsonb;
  elsif p_action='rename' then
    if t.revision<>(p_data->>'revision')::integer or p_data->>'revision' is null then raise exception 'history_conflict' using errcode='40001'; end if;
    if length(btrim(p_data->>'title')) not between 1 and 100 or p_data->>'title' is null then raise exception 'history_invalid' using errcode='22023'; end if;
    update private.chat_threads set title=btrim(p_data->>'title'),revision=revision+1,updated_at=now() where id=tid returning * into t;
    return to_jsonb(t)-'user_id';
  elsif p_action='delete' then
    if s.active_run is not null then raise exception 'history_busy' using errcode='40001'; end if;
    delete from public.chat_feedback where user_id=p_user_id and thread_id=tid;
    delete from private.chat_threads where id=tid;
    return '{}'::jsonb;
  end if;
  raise exception 'history_invalid' using errcode='22023';
end $$;
create function public.chat_history(p_user_id uuid,p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
  select private.chat_history(p_user_id,p_action,p_data);
$$;
revoke all on function private.chat_history(uuid,text,jsonb),public.chat_history(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.chat_history(uuid,text,jsonb),public.chat_history(uuid,text,jsonb) to service_role;

-- Preserve the draft link transactionally, even if generation fails before presenting it.
create function private.remember_chat_draft() returns trigger language plpgsql security definer set search_path='' as $$
begin
  -- Match the thread-then-state lock order used by history reads and checkpoints.
  update private.chat_threads set requires_organizer=true where id=new.thread_id and user_id=new.created_by;
  update private.chat_thread_state s set context=s.context || jsonb_build_object('eventDraftId',new.id)
    from private.chat_threads t where s.thread_id=t.id and t.id=new.thread_id and t.user_id=new.created_by;
  return new;
end $$;
revoke all on function private.remember_chat_draft() from public,anon,authenticated;
create trigger remember_chat_draft after insert on public.chat_event_drafts for each row execute function private.remember_chat_draft();

alter table public."Events" add column description text not null default '';

create table public.chat_event_drafts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id),
  thread_id uuid not null,
  request_key text not null check (length(request_key) between 1 and 128),
  version integer not null default 1,
  state text not null default 'draft' check (state in ('draft','published','discarded')),
  content jsonb not null check (octet_length(content::text) <= 40000),
  event_id uuid references public."Events"(id) on delete set null,
  event_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, thread_id, request_key)
);
create index chat_event_drafts_event_idx on public.chat_event_drafts(event_id);
create index chat_event_drafts_updated_idx on public.chat_event_drafts(updated_at desc);
create table public.chat_event_draft_audit (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.chat_event_drafts(id),
  actor_id uuid not null references auth.users(id),
  action text not null,
  version integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create index chat_event_draft_audit_draft_idx on public.chat_event_draft_audit(draft_id, created_at);
create index chat_event_draft_audit_actor_idx on public.chat_event_draft_audit(actor_id);
alter table public.chat_event_drafts enable row level security;
alter table public.chat_event_draft_audit enable row level security;
revoke all on public.chat_event_drafts, public.chat_event_draft_audit from public, anon, authenticated;
grant select on public.chat_event_drafts, public.chat_event_draft_audit to authenticated;
grant all on public.chat_event_drafts, public.chat_event_draft_audit to service_role;
create policy "Approved organizers read event drafts" on public.chat_event_drafts for select to authenticated
  using ((select private.can_current_user_chat()) and (select private.can_current_user_read_talk_submissions()));
create policy "Approved organizers read draft audit" on public.chat_event_draft_audit for select to authenticated
  using ((select private.can_current_user_chat()) and (select private.can_current_user_read_talk_submissions()));

create function private.validate_chat_event_content(p jsonb, publishing boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare t jsonb; sid uuid; starts timestamptz;
begin
  if jsonb_typeof(p) <> 'object' or length(coalesce(p->>'title','')) not between 3 and 160
    or length(coalesce(p->>'description','')) > 4000
    or jsonb_typeof(p->'talks') is distinct from 'array' or jsonb_array_length(p->'talks') > 3
    or length(coalesce(p->>'meetupUrl','')) > 500 or length(coalesce(p->>'imageUrl','')) > 1000 then
    raise exception 'invalid_draft' using errcode = '22023';
  end if;
  if nullif(p->>'startsAt','') is not null then
    if p->>'startsAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$' then raise exception 'invalid_date' using errcode='22023'; end if;
    starts := (p->>'startsAt')::timestamp at time zone 'Europe/Zurich';
    if to_char(starts at time zone 'Europe/Zurich','YYYY-MM-DD"T"HH24:MI') <> p->>'startsAt' then
      raise exception 'invalid_local_time' using errcode='22023';
    end if;
  end if;
  if nullif(p->>'venueId','') is not null and not exists(select 1 from public."Venues" where id=(p->>'venueId')::uuid) then
    raise exception 'invalid_venue' using errcode='22023';
  end if;
  if (p->>'meetupUrl' <> '' and p->>'meetupUrl' !~ '^https://[^[:space:]]+$')
    or (p->>'imageUrl' <> '' and p->>'imageUrl' !~ '^https://[^[:space:]]+$') then
    raise exception 'invalid_url' using errcode='22023';
  end if;
  if publishing and (starts is null or starts <= now() or nullif(p->>'venueId','') is null
    or coalesce(p->>'meetupUrl','') = '' or jsonb_array_length(p->'talks') not between 2 and 3) then
    raise exception 'complete_future_date_venue_meetup_and_two_or_three_talks' using errcode='22023';
  end if;
  if (select count(*) <> count(distinct x->>'id') from jsonb_array_elements(p->'talks') x) then
    raise exception 'duplicate_talk' using errcode='22023';
  end if;
  for t in select * from jsonb_array_elements(p->'talks') loop
    perform (t->>'id')::uuid;
    if length(coalesce(t->>'title','')) not between 3 and 160 or length(coalesce(t->>'description','')) not between 1 and 5000
      or jsonb_typeof(t->'speakerIds') is distinct from 'array' or jsonb_array_length(t->'speakerIds') not between 1 and 5
      or (select count(*) <> count(distinct x) from jsonb_array_elements_text(t->'speakerIds') x) then
      raise exception 'invalid_talk' using errcode='22023';
    end if;
    for sid in select value::uuid from jsonb_array_elements_text(t->'speakerIds') loop
      if not exists(select 1 from public."People" where id=sid) then raise exception 'invalid_speaker' using errcode='22023'; end if;
    end loop;
  end loop;
end $$;
revoke all on function private.validate_chat_event_content(jsonb,boolean) from public, anon, authenticated;

create function private.mutate_chat_event_draft(p_action text, p_id uuid, p_version integer, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.chat_event_drafts; c jsonb; t jsonb; tid uuid; existing record;
begin
  if not private.can_current_user_chat() or not private.can_current_user_read_talk_submissions() then
    raise exception 'not_allowed' using errcode='42501';
  end if;
  if p_action = 'create' then
    c := jsonb_build_object('title',p_data->>'title','description',coalesce(p_data->>'description',''),
      'startsAt',coalesce(p_data->>'startsAt',''),'venueId',coalesce(p_data->>'venueId',''),
      'meetupUrl',coalesce(p_data->>'meetupUrl',''),'imageUrl',coalesce(p_data->>'imageUrl',''),'talks','[]'::jsonb);
    perform private.validate_chat_event_content(c);
    insert into public.chat_event_drafts(created_by,thread_id,request_key,content)
      values(auth.uid(),(p_data->>'threadId')::uuid,p_data->>'requestKey',c)
      on conflict (created_by,thread_id,request_key) do nothing returning * into d;
    if d.id is null then
      select * into d from public.chat_event_drafts where created_by=auth.uid()
        and thread_id=(p_data->>'threadId')::uuid and request_key=p_data->>'requestKey';
      return to_jsonb(d);
    end if;
  else
    select * into d from public.chat_event_drafts where id=p_id for update;
    if d.id is null then raise exception 'draft_not_found' using errcode='P0002'; end if;
    if d.state <> 'draft' or d.version is distinct from p_version then raise exception 'draft_changed_reload' using errcode='40001'; end if;
    c := d.content;
    if p_action = 'update' then
      -- Only these editable fields can enter a draft; state/talk IDs cannot be patched.
      select c || coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into c from jsonb_each(p_data)
        where key in ('title','description','startsAt','venueId','meetupUrl','imageUrl') and value <> 'null'::jsonb;
    elsif p_action = 'create_talk' then
      tid := (p_data->>'talkId')::uuid;
      t := jsonb_build_object('id',tid,'title',p_data->>'title','description',p_data->>'description',
        'speakerIds',p_data->'speakerIds','sourceTalkId',null);
      c := jsonb_set(c,'{talks}',(c->'talks') || jsonb_build_array(t));
    elsif p_action = 'attach' then
      tid := (p_data->>'talkId')::uuid;
      select talk.*, submission.status into existing from public."Talks" talk
        join submissions.talk_submissions submission on submission.id=talk.source_talk_submission_id
        where talk.id=tid and talk.event_id is null and submission.status='approved';
      if not found then raise exception 'talk_not_assignable' using errcode='22023'; end if;
      t := jsonb_build_object('id',tid,'sourceTalkId',tid,'title',existing.title,'description',existing.description,
        'speakerIds',(select jsonb_agg(speaker_id order by speaker_id) from public."SpeakerOnTalk" where talk_id=tid));
      c := jsonb_set(c,'{talks}',(c->'talks') || jsonb_build_array(t));
    elsif p_action = 'remove_talk' then
      c := jsonb_set(c,'{talks}',coalesce((select jsonb_agg(x) from jsonb_array_elements(c->'talks') x where x->>'id' <> p_data->>'talkId'),'[]'));
    elsif p_action is distinct from 'discard' then raise exception 'unknown_draft_action' using errcode='22023';
    end if;
    perform private.validate_chat_event_content(c);
    update public.chat_event_drafts set content=c, version=version+1, updated_at=now(),
      state=case when p_action='discard' then 'discarded' else 'draft' end where id=d.id returning * into d;
  end if;
  insert into public.chat_event_draft_audit(draft_id,actor_id,action,version,snapshot)
    values(d.id,auth.uid(),p_action,d.version,d.content);
  return to_jsonb(d);
end $$;
revoke all on function private.mutate_chat_event_draft(text,uuid,integer,jsonb) from public, anon;
grant execute on function private.mutate_chat_event_draft(text,uuid,integer,jsonb) to authenticated;
create function public.mutate_chat_event_draft(p_action text, p_id uuid, p_version integer, p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$
  select private.mutate_chat_event_draft(p_action,p_id,p_version,p_data);
$$;
revoke all on function public.mutate_chat_event_draft(text,uuid,integer,jsonb) from public, anon;
grant execute on function public.mutate_chat_event_draft(text,uuid,integer,jsonb) to authenticated;

-- Only the server can publish, after verifying its short-lived approval signature.
create function private.publish_chat_event_draft(p_id uuid,p_version integer,p_actor uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.chat_event_drafts; c jsonb; t jsonb; tid uuid; eid uuid; candidate_slug text; base text;
  suffix integer := 1; n integer := 0; sid uuid; old_talk record;
begin
  if not exists(select 1 from auth.users u where u.id=p_actor and private.is_allowed_google_account(u.email)) then
    raise exception 'not_allowed' using errcode='42501';
  end if;
  select * into d from public.chat_event_drafts where id=p_id for update;
  if d.id is null then raise exception 'draft_not_found' using errcode='P0002'; end if;
  -- Lost responses can be retried without producing another event.
  if d.state='published' and d.version=p_version+1 then return to_jsonb(d); end if;
  if d.state <> 'draft' or d.version is distinct from p_version then raise exception 'draft_changed_reload' using errcode='40001'; end if;
  c := d.content;
  perform private.validate_chat_event_content(c,true);
  perform 1 from public."Venues" where id=(c->>'venueId')::uuid for key share;
  -- Stable lock ordering prevents two competing drafts assigning the same talk.
  perform 1 from public."Talks" where id in (select (x->>'sourceTalkId')::uuid from jsonb_array_elements(c->'talks') x)
    order by id for update;
  base := private.slugify_event_title(c->>'title');
  perform pg_advisory_xact_lock(hashtext('event-slug:' || base));
  candidate_slug := base;
  while exists(select 1 from public."Events" e where e.slug=candidate_slug) loop
    suffix := suffix+1; candidate_slug := base || '-' || suffix;
  end loop;
  insert into public."Events"(title,description,slug,starts_at,venue_id,meetup_url,feature_graphic,public)
    values(c->>'title',c->>'description',candidate_slug,(c->>'startsAt')::timestamp at time zone 'Europe/Zurich',
      (c->>'venueId')::uuid,c->>'meetupUrl',nullif(c->>'imageUrl',''),false) returning id into eid;
  for t in select * from jsonb_array_elements(c->'talks') loop
    n := n+1;
    if nullif(t->>'sourceTalkId','') is not null then
      tid := (t->>'sourceTalkId')::uuid;
      select talk.*, submission.status into old_talk from public."Talks" talk
        join submissions.talk_submissions submission on submission.id=talk.source_talk_submission_id where talk.id=tid
        for update of submission;
      if not found or old_talk.event_id is not null or old_talk.status <> 'approved'
        or old_talk.title <> t->>'title' or old_talk.description <> t->>'description'
        or (select jsonb_agg(speaker_id order by speaker_id) from public."SpeakerOnTalk" where talk_id=tid) is distinct from t->'speakerIds' then
        raise exception 'talk_changed_reattach' using errcode='40001';
      end if;
      update public."Talks" set event_id=eid,sort_order=n*10 where id=tid;
      update submissions.talk_submissions set status='assigned_to_event' where id=old_talk.source_talk_submission_id;
      insert into submissions.talk_submission_status_events(submission_id,from_status,to_status,action,actor_kind,actor_user_id)
        values(old_talk.source_talk_submission_id,'approved','assigned_to_event','assigned_to_event','reviewer',p_actor);
    else
      insert into public."Talks"(title,description,event_id,created_by,sort_order,presentation_time)
        values(t->>'title',t->>'description',eid,p_actor::text,n*10,40) returning id into tid;
      for sid in select value::uuid from jsonb_array_elements_text(t->'speakerIds') loop
        insert into public."SpeakerOnTalk"(speaker_id,talk_id) values(sid,tid);
        insert into public."PeopleOnRoles"(person_id,role) values(sid,'SPEAKER'::public."ROLES")
          on conflict (person_id,role) do nothing;
      end loop;
    end if;
  end loop;
  update public."Events" set public=true where id=eid;
  update public.chat_event_drafts set state='published',event_id=eid,event_slug=candidate_slug,version=version+1,updated_at=now()
    where id=p_id returning * into d;
  insert into public.chat_event_draft_audit(draft_id,actor_id,action,version,snapshot)
    values(d.id,p_actor,'publish',d.version,d.content);
  return to_jsonb(d);
end $$;
revoke all on function private.publish_chat_event_draft(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function private.publish_chat_event_draft(uuid,integer,uuid) to service_role;
create function public.publish_chat_event_draft(p_id uuid,p_version integer,p_actor uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.publish_chat_event_draft(p_id,p_version,p_actor);
$$;
revoke all on function public.publish_chat_event_draft(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.publish_chat_event_draft(uuid,integer,uuid) to service_role;

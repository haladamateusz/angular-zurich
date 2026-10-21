-- Finalizing a chat draft creates a private dashboard event. Visibility is
-- changed separately by an organizer in the event editor.
alter table public.chat_event_drafts
  drop constraint chat_event_drafts_state_check,
  add constraint chat_event_drafts_state_check
    check (state in ('draft', 'saved', 'published', 'discarded'));

-- Preserve the existing RPC entry point for older clients, with draft-only semantics.
create or replace function private.publish_chat_event_draft(p_id uuid,p_version integer,p_actor uuid)
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
  if d.state in ('saved','published') and d.version=p_version+1 then return to_jsonb(d); end if;
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
  update public.chat_event_drafts set state='saved',event_id=eid,event_slug=candidate_slug,version=version+1,updated_at=now()
    where id=p_id returning * into d;
  insert into public.chat_event_draft_audit(draft_id,actor_id,action,version,snapshot)
    values(d.id,p_actor,'save_event',d.version,d.content);
  return to_jsonb(d);
end $$;

create function public.save_chat_event_draft(p_id uuid,p_version integer,p_actor uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select private.publish_chat_event_draft(p_id,p_version,p_actor);
$$;
revoke all on function public.save_chat_event_draft(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.save_chat_event_draft(uuid,integer,uuid) to service_role;

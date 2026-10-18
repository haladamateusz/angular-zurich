-- Feedback is a user-submitted snapshot, not an authoritative agent audit log.
create table public.chat_feedback (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null,
  thread_id uuid not null,
  rating text not null check (rating in ('useful', 'not_quite')),
  question text not null check (char_length(btrim(question)) between 1 and 2000),
  answer text not null check (char_length(btrim(answer)) between 1 and 12000),
  source_ids uuid[] not null default '{}' check (cardinality(source_ids) <= 10),
  result jsonb check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 16000)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.chat_feedback enable row level security;
revoke all on public.chat_feedback from public, anon, authenticated;
grant select, insert, update, delete on public.chat_feedback to authenticated;
grant all on public.chat_feedback to service_role;

create policy chat_feedback_select on public.chat_feedback for select to authenticated
  using (user_id = (select auth.uid()) and (select private.can_current_user_chat()));
create policy chat_feedback_insert on public.chat_feedback for insert to authenticated
  with check (user_id = (select auth.uid()) and (select private.can_current_user_chat()));
create policy chat_feedback_update on public.chat_feedback for update to authenticated
  using (user_id = (select auth.uid()) and (select private.can_current_user_chat()))
  with check (user_id = (select auth.uid()) and (select private.can_current_user_chat()));
create policy chat_feedback_delete on public.chat_feedback for delete to authenticated
  using (user_id = (select auth.uid()) and (select private.can_current_user_chat()));

create function private.stamp_chat_feedback()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.stamp_chat_feedback() from public, anon, authenticated;
create trigger stamp_chat_feedback before insert or update on public.chat_feedback
  for each row execute function private.stamp_chat_feedback();

comment on table public.chat_feedback is
  'Explicit answer feedback from approved users. Context is client-reported; no automatic conversation history.';

create or replace function private.talk_submission_exists(
  p_submission_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from submissions.talk_submissions ts
    where ts.id = p_submission_id
  );
$$;

grant execute on function private.talk_submission_exists(uuid) to anon, authenticated;
revoke execute on function private.talk_submission_exists(uuid) from public;

create or replace function public.talk_submission_exists(
  p_submission_id uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.talk_submission_exists(p_submission_id);
$$;

grant execute on function public.talk_submission_exists(uuid) to anon, authenticated;
revoke execute on function public.talk_submission_exists(uuid) from public;

-- Raise the per-user daily quota; retain existing access, concurrency and budget guards.
create or replace function private.reserve_chat_run(p_user_id uuid, p_run_id uuid, p_daily_budget_cents integer)
returns text language plpgsql security definer set search_path = '' as $$
declare day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  -- Global lock covers the global daily cap and each user's overlapping limits.
  perform pg_advisory_xact_lock(782347128);
  if not exists (select 1 from auth.users u where u.id = p_user_id and private.is_allowed_google_account(u.email)) then return 'forbidden'; end if;
  if exists (select 1 from private.chat_runs where run_id = p_run_id) then return 'duplicate'; end if;
  if exists (select 1 from private.chat_runs where user_id = p_user_id and finished_at is null and started_at > now() - interval '2 minutes') then return 'busy'; end if;
  if (select count(*) from private.chat_runs where user_id = p_user_id and started_at > now() - interval '1 minute') >= 5 then return 'minute_limit'; end if;
  if (select count(*) from private.chat_runs where user_id = p_user_id and started_at >= day_start) >= 200 then return 'daily_limit'; end if;
  if p_daily_budget_cents is null or p_daily_budget_cents < 10 or
    (select coalesce(sum(reserved_cents), 0) from private.chat_runs where started_at >= day_start) + 10 > p_daily_budget_cents then return 'budget_limit'; end if;
  insert into private.chat_runs(run_id, user_id) values (p_run_id, p_user_id);
  return 'ok';
end;
$$;

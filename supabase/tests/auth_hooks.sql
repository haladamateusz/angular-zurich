-- Run as postgres after migrations. No Auth users are created; fixtures roll back.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Hosted postgres cannot SET ROLE to the managed Auth role. Check its ACLs
-- separately, then exercise the invoker functions as the database owner.
do $$
begin
  if not has_schema_privilege('supabase_auth_admin', 'private', 'USAGE')
    or not has_table_privilege('supabase_auth_admin', 'private.allowed_google_accounts', 'SELECT')
    or not has_function_privilege('supabase_auth_admin', 'private.is_allowed_google_account(text)', 'EXECUTE')
    or not has_function_privilege('supabase_auth_admin', 'private.allowlist_google_before_user_created(jsonb)', 'EXECUTE')
    or not has_function_privilege('supabase_auth_admin', 'private.allowlist_google_custom_access_token(jsonb)', 'EXECUTE') then
    raise exception 'Auth service lacks required hook privileges';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'private' and c.relname = 'allowed_google_accounts'
      and c.relrowsecurity
  ) then
    raise exception 'Allowlist RLS enabled: test its policies under the Auth role before relying on ACL checks';
  end if;
end;
$$;

create temporary table auth_hook_fixture on commit drop as
select 'auth-test-' || gen_random_uuid()::text || '@gmail.com' as email;
insert into private.allowed_google_accounts (email, active, first_name, last_name)
select email, true, 'Auth', 'Test' from auth_hook_fixture;

do $$
declare
  allowed_email text := (select email from auth_hook_fixture);
  token_event jsonb;
  denied_email text;
begin
  if private.allowlist_google_before_user_created(
    jsonb_build_object('user', jsonb_build_object('email', allowed_email))
  ) is distinct from '{}'::jsonb then
    raise exception 'Active organizer enrollment rejected';
  end if;
  token_event := jsonb_build_object('claims', jsonb_build_object(
    'email', allowed_email, 'role', 'authenticated', 'sub', gen_random_uuid()::text
  ));
  if private.allowlist_google_custom_access_token(token_event) is distinct from token_event then
    raise exception 'Active organizer claims changed or rejected';
  end if;
  foreach denied_email in array array[
    'outsider-' || gen_random_uuid()::text || '@gmail.com',
    'outsider@example.invalid', '', null
  ] loop
    if private.allowlist_google_before_user_created(
      jsonb_build_object('user', jsonb_build_object('email', denied_email))
    ) #>> '{error,http_code}' is distinct from '403' then
      raise exception 'Unauthorized enrollment accepted';
    end if;
    if private.allowlist_google_custom_access_token(
      jsonb_build_object('claims', jsonb_build_object('email', denied_email))
    ) #>> '{error,http_code}' is distinct from '403' then
      raise exception 'Unauthorized token accepted';
    end if;
  end loop;
end;
$$;

update private.allowed_google_accounts set active = false
where email = (select email from auth_hook_fixture);
do $$
declare
  revoked_email text := (select email from auth_hook_fixture);
begin
  if private.allowlist_google_before_user_created(
    jsonb_build_object('user', jsonb_build_object('email', revoked_email))
  ) #>> '{error,http_code}' is distinct from '403' then
    raise exception 'Inactive organizer enrollment accepted';
  end if;
  if private.allowlist_google_custom_access_token(
    jsonb_build_object('claims', jsonb_build_object('email', revoked_email))
  ) #>> '{error,http_code}' is distinct from '403' then
    raise exception 'Inactive organizer token accepted';
  end if;
end;
$$;
rollback;
select 'Auth hook assertions passed; fixtures rolled back' as result;

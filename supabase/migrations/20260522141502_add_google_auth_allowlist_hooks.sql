create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to postgres;
grant usage on schema private to supabase_auth_admin;

create table if not exists private.allowed_google_accounts (
  email text primary key,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc'::text, now()),
  constraint allowed_google_accounts_email_lowercase_chk
    check (email = lower(trim(email))),
  constraint allowed_google_accounts_email_gmail_chk
    check (split_part(email, '@', 2) = 'gmail.com')
);

comment on table private.allowed_google_accounts is
  'Manual allowlist for Google organizer sign-in. Insert approved Gmail addresses directly in Supabase, not via committed seed data.';

create or replace function private.is_allowed_google_account(p_email text)
returns boolean
language plpgsql
stable
as $$
declare
  normalized_email text := lower(trim(coalesce(p_email, '')));
begin
  if normalized_email = '' then
    return false;
  end if;

  if split_part(normalized_email, '@', 2) <> 'gmail.com' then
    return false;
  end if;

  return exists (
    select 1
    from private.allowed_google_accounts allowed_account
    where allowed_account.email = normalized_email
      and allowed_account.active
  );
end;
$$;

create or replace function private.allowlist_google_before_user_created(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  user_email text := coalesce(
    event->'user'->>'email',
    event->>'email'
  );
begin
  if private.is_allowed_google_account(user_email) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This Google account is not authorized for organizer access.'
    )
  );
end;
$$;

create or replace function private.allowlist_google_custom_access_token(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  user_email text := coalesce(
    event->'claims'->>'email',
    event->>'email'
  );
begin
  if private.is_allowed_google_account(user_email) then
    return event;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This Google account is not authorized for organizer access.'
    )
  );
end;
$$;

grant select on table private.allowed_google_accounts to supabase_auth_admin;
grant execute on function private.is_allowed_google_account(text) to supabase_auth_admin;
grant execute on function private.allowlist_google_before_user_created(jsonb) to supabase_auth_admin;
grant execute on function private.allowlist_google_custom_access_token(jsonb) to supabase_auth_admin;

revoke all on table private.allowed_google_accounts from anon, authenticated, public;
revoke execute on function private.is_allowed_google_account(text) from anon, authenticated, public;
revoke execute on function private.allowlist_google_before_user_created(jsonb) from anon, authenticated, public;
revoke execute on function private.allowlist_google_custom_access_token(jsonb) from anon, authenticated, public;

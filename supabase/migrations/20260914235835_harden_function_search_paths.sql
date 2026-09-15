-- All referenced objects are schema-qualified. An empty function-local path
-- prevents callers from influencing object resolution through search_path.
alter function submissions.set_updated_at()
  set search_path = '';

alter function private.is_allowed_google_account(text)
  set search_path = '';

alter function private.allowlist_google_before_user_created(jsonb)
  set search_path = '';

alter function private.allowlist_google_custom_access_token(jsonb)
  set search_path = '';

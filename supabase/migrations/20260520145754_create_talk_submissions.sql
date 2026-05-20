create schema if not exists submissions;

revoke all on schema submissions from public, anon, authenticated;
grant usage on schema submissions to postgres, service_role;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'submissions'
      and t.typname = 'talk_submission_status'
  ) then
    create type submissions.talk_submission_status as enum (
      'pending',
      'reviewing',
      'accepted',
      'rejected'
    );
  end if;
end
$$;

create table if not exists submissions.talk_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status submissions.talk_submission_status not null default 'pending',
  talk_title text not null,
  talk_description text not null,
  speaker_name text not null,
  speaker_email text not null,
  speaker_bio text not null,
  speaker_contact_info text not null,
  source_ip_hash text,
  email_hash text,
  user_agent text,
  origin text,
  review_notes text,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  constraint talk_submissions_talk_title_length_check
    check (char_length(btrim(talk_title)) between 5 and 160),
  constraint talk_submissions_talk_description_length_check
    check (char_length(btrim(talk_description)) between 40 and 6000),
  constraint talk_submissions_speaker_name_length_check
    check (char_length(btrim(speaker_name)) between 2 and 120),
  constraint talk_submissions_speaker_email_length_check
    check (char_length(btrim(speaker_email)) between 5 and 320),
  constraint talk_submissions_speaker_bio_length_check
    check (char_length(btrim(speaker_bio)) between 20 and 4000),
  constraint talk_submissions_speaker_contact_info_length_check
    check (char_length(btrim(speaker_contact_info)) between 5 and 1000),
  constraint talk_submissions_review_consistency_check
    check (
      (status in ('pending', 'reviewing') and reviewed_at is null)
      or (status in ('accepted', 'rejected'))
    )
);

create table if not exists submissions.talk_submission_rate_limits (
  scope text not null,
  key_hash text not null,
  window_bucket timestamptz not null,
  request_count integer not null default 1,
  last_seen_at timestamptz not null default now(),
  primary key (scope, key_hash, window_bucket),
  constraint talk_submission_rate_limits_scope_check
    check (scope in ('ip_15m', 'email_1d'))
);

create index if not exists talk_submissions_status_created_at_idx
  on submissions.talk_submissions (status, created_at desc);

create index if not exists talk_submissions_email_hash_created_at_idx
  on submissions.talk_submissions (email_hash, created_at desc)
  where email_hash is not null;

create index if not exists talk_submission_rate_limits_window_bucket_idx
  on submissions.talk_submission_rate_limits (window_bucket desc);

alter table submissions.talk_submissions enable row level security;
alter table submissions.talk_submission_rate_limits enable row level security;

revoke all on table submissions.talk_submissions from public, anon, authenticated;
revoke all on table submissions.talk_submission_rate_limits from public, anon, authenticated;

grant all on table submissions.talk_submissions to service_role;
grant all on table submissions.talk_submission_rate_limits to service_role;

create or replace function submissions.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_talk_submissions_updated_at on submissions.talk_submissions;

create trigger set_talk_submissions_updated_at
before update on submissions.talk_submissions
for each row
execute function submissions.set_updated_at();

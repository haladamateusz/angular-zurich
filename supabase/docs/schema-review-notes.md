# Supabase Schema Notes

## Immediate hardening

The migration in `supabase/migrations/20260415223000_harden_people_roles_schema.sql` is the smallest safe improvement to the current production schema:

- adds an index for `PeopleOnRoles.person_id`
- removes overly broad table grants and keeps read-only access
- drops the incorrect default UUID on `PeopleOnRoles.person_id`
- deletes null `person_id` rows
- removes duplicate `(person_id, role)` rows
- enforces `person_id` as `not null`
- adds a uniqueness constraint on `(person_id, role)`

## Longer-term redesign

The current schema works, but a more maintainable version would use snake_case identifiers and a narrower API surface.

Suggested target model:

```sql
create type public.role_kind as enum (
  'former_organizer',
  'organizer',
  'speaker'
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  slug text not null unique,
  email text not null,
  abstract text,
  personal_url text,
  twitter_url text,
  linkedin_url text,
  github_url text,
  picture_url text,
  created_at timestamptz not null default now()
);

create table public.person_roles (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  role role_kind not null,
  created_at timestamptz not null default now(),
  unique (person_id, role)
);

create index person_roles_person_id_idx on public.person_roles (person_id);
create index person_roles_role_idx on public.person_roles (role);
```

Why this is better:

- snake_case avoids mandatory quoted identifiers in SQL
- `person_id` cannot silently generate invalid UUIDs
- `on delete cascade` keeps join rows in sync when a person is removed
- a role-specific index helps when querying all organizers or speakers

## API shape

If the frontend only needs public profile data, the cleanest exposed shape is usually:

1. Keep base tables protected with RLS.
2. Expose a small `api` schema instead of broad `public` access.
3. Publish read-only views or RPCs for exactly what the frontend needs.

Example direction:

```sql
create schema if not exists api;
grant usage on schema api to anon, authenticated;

create view api.organizers
with (security_invoker = true) as
select
  p.slug,
  p.first_name,
  p.last_name,
  p.picture_url
from public.people p
join public.person_roles pr on pr.person_id = p.id
where pr.role = 'organizer';
```

`security_invoker = true` is important so the view respects RLS policies for `anon` and `authenticated`.

## Migration tracking

Your remote project currently has no tracked migration history. To make the schema reproducible in Git:

1. Initialize Supabase locally if this repo is not already linked.
2. Pull the remote schema into a baseline migration or declarative schema file.
3. Commit that baseline before adding new migrations.

Typical starting commands:

```bash
supabase init
supabase link --project-ref krjsmflnjjbdwzzxmmtt
supabase db pull
```

After that, future changes can live in `supabase/migrations/`.

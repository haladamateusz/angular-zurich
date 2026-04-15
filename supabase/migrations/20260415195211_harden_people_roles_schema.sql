begin;

-- Speed up joins from PeopleOnRoles -> People.
create index if not exists "PeopleOnRoles_person_id_idx"
on public."PeopleOnRoles" ("person_id");

-- Narrow Data API privileges to match the current read-only RLS model.
revoke all on table public."People" from anon, authenticated;
revoke all on table public."PeopleOnRoles" from anon, authenticated;

grant select on table public."People" to anon, authenticated;
grant select on table public."PeopleOnRoles" to anon, authenticated;

-- A join table row should always point at a real person.
alter table public."PeopleOnRoles"
alter column "person_id" drop default;

-- Remove malformed rows before tightening constraints.
delete from public."PeopleOnRoles"
where "person_id" is null;

-- Deduplicate repeated role assignments, keeping the oldest row.
with ranked as (
  select
    id,
    row_number() over (
      partition by "person_id", "role"
      order by "created_at" asc nulls last, id asc
    ) as row_num
  from public."PeopleOnRoles"
)
delete from public."PeopleOnRoles" p
using ranked r
where p.id = r.id
  and r.row_num > 1;

alter table public."PeopleOnRoles"
alter column "person_id" set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'PeopleOnRoles_person_id_role_key'
      and conrelid = 'public."PeopleOnRoles"'::regclass
  ) then
    alter table public."PeopleOnRoles"
    add constraint "PeopleOnRoles_person_id_role_key"
    unique ("person_id", "role");
  end if;
end
$$;

commit;

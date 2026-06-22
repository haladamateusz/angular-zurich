alter table public."Events"
  add column if not exists slug text;

update public."Events"
set slug = trim(
  both '-'
  from regexp_replace(
    lower(regexp_replace(title, '^Angular Zurich[[:space:]]+', '', 'i')),
    '[^a-z0-9]+',
    '-',
    'g'
  )
)
where slug is null;

alter table public."Events"
  alter column slug set not null;

create unique index if not exists events_slug_key
  on public."Events" using btree (slug);

begin;

-- Represent missing contact information as NULL while preserving people and their relationships.
alter table public."People"
  alter column email drop not null;

update public."People"
set email = null
where email = 'UNKNOWN';

commit;

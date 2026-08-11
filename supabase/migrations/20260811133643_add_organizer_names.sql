alter table private.allowed_google_accounts
  add column first_name text,
  add column last_name text;

update private.allowed_google_accounts as account
set
  first_name = organizer.first_name,
  last_name = organizer.last_name
from (
  values
    ('haladamateusz@gmail.com', 'Mateusz', 'Halada'),
    ('tomas.trajan@gmail.com', 'Tomas', 'Trajan')
) as organizer(email, first_name, last_name)
where account.email = organizer.email;

alter table private.allowed_google_accounts
  alter column first_name set not null,
  alter column last_name set not null,
  add constraint allowed_google_accounts_first_name_trimmed_chk
    check (first_name = btrim(first_name) and first_name <> ''),
  add constraint allowed_google_accounts_last_name_trimmed_chk
    check (last_name = btrim(last_name) and last_name <> '');

comment on table private.allowed_google_accounts is
  'Manual allowlist for Google organizer sign-in. Insert approved organizer Gmail addresses and names directly in Supabase, not via committed seed data.';

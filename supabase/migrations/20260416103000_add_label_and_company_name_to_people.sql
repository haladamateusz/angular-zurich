alter table public."People"
add column if not exists "label" text,
add column if not exists "company_name" text;

update public."People"
set "label" = 'Angular & Nx architecture specialist'
where "slug" = 'mateusz-halada';

update public."People"
set
  "label" = 'Architect, Consultant and Trainer, GDE',
  "company_name" = 'AngularExperts.io'
where "slug" = 'tomas-trajan';

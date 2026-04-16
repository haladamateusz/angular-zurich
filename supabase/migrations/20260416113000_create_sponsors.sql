create table public."Sponsors" (
    "id" uuid default gen_random_uuid() not null,
    "title" text not null,
    "logo_url" text not null,
    "website_url" text not null,
    "created_by" text not null
);

alter table public."Sponsors" owner to postgres;

alter table only public."Sponsors"
    add constraint "Sponsors_pkey" primary key ("id");

alter table public."Sponsors" enable row level security;

create policy "Public can read sponsors"
on public."Sponsors"
as permissive
for select
to anon, authenticated
using (true);

revoke all on table public."Sponsors" from anon, authenticated;
grant all on table public."Sponsors" to service_role;
grant select on table public."Sponsors" to anon;
grant select on table public."Sponsors" to authenticated;

insert into public."Sponsors" (
    "title",
    "logo_url",
    "website_url",
    "created_by"
)
values
    (
        'AngularExperts',
        'https://krjsmflnjjbdwzzxmmtt.supabase.co/storage/v1/object/public/sponsors/angular-experts.svg',
        'https://angularexperts.io',
        'Mateusz'
    ),
    (
        'AngularDay',
        'https://krjsmflnjjbdwzzxmmtt.supabase.co/storage/v1/object/public/sponsors/angular-day.svg',
        'https://angularday.it',
        'Mateusz'
    ),
    (
        'Coalist',
        'https://krjsmflnjjbdwzzxmmtt.supabase.co/storage/v1/object/public/sponsors/coalist.svg',
        'https://coalist.ch',
        'Mateusz'
    ),
    (
        'Syncrea',
        'https://krjsmflnjjbdwzzxmmtt.supabase.co/storage/v1/object/public/sponsors/syncrea.svg',
        'https://syncrea.ch',
        'Mateusz'
    );

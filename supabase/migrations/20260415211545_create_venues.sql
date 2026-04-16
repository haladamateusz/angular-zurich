create table "public"."Venues" (
    "id" "uuid" default "gen_random_uuid"() not null,
    "title" "text" not null,
    "street" "text" not null,
    "city" "text" not null,
    "zip" "text" not null,
    "latitude" double precision not null,
    "longitude" double precision not null,
    "created_by" "text" not null
);

alter table "public"."Venues" owner to "postgres";

alter table only "public"."Venues"
    add constraint "Venues_pkey" primary key ("id");

alter table "public"."Venues" enable row level security;

create policy "Public can read venues"
on "public"."Venues"
as permissive
for select
to anon, authenticated
using (true);

revoke all on table "public"."Venues" from anon, authenticated;
grant all on table "public"."Venues" to "service_role";
grant select on table "public"."Venues" to "anon";
grant select on table "public"."Venues" to "authenticated";

insert into "public"."Venues" (
    "title",
    "street",
    "city",
    "zip",
    "latitude",
    "longitude",
    "created_by"
)
values (
    'Constructor Nexademy',
    'Foerrlibuckstrasse 150',
    'Zürich',
    '8005',
    47.3923066,
    8.5114869,
    'Mateusz'
);

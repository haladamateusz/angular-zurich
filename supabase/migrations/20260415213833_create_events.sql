create table "public"."Events" (
    "id" "uuid" default "gen_random_uuid"() not null,
    "title" "text" not null,
    "meetup_url" "text" not null,
    "starts_at" timestamp with time zone not null,
    "venue_id" "uuid" not null
);

alter table "public"."Events" owner to "postgres";

alter table only "public"."Events"
    add constraint "Events_pkey" primary key ("id");

create index "Events_venue_id_idx" on "public"."Events" using "btree" ("venue_id");

alter table only "public"."Events"
    add constraint "Events_venue_id_fkey"
    foreign key ("venue_id") references "public"."Venues"("id")
    on update cascade
    on delete restrict;

alter table "public"."Events" enable row level security;

create policy "Public can read events"
on "public"."Events"
as permissive
for select
to anon, authenticated
using (true);

revoke all on table "public"."Events" from anon, authenticated;
grant all on table "public"."Events" to "service_role";
grant select on table "public"."Events" to "anon";
grant select on table "public"."Events" to "authenticated";

insert into "public"."Events" (
    "title",
    "meetup_url",
    "starts_at",
    "venue_id"
)
select
    'Angular Zurich February 2026',
    'https://www.meetup.com/angularzrh/events/313301095/',
    '2026-02-17 17:00:00+00'::timestamp with time zone,
    v."id"
from "public"."Venues" v
where v."title" = 'Constructor Nexademy'
  and v."street" = 'Foerrlibuckstrasse 150';

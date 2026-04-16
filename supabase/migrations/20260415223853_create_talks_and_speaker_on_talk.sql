create table "public"."Talks" (
    "id" "uuid" default "gen_random_uuid"() not null,
    "title" "text" not null,
    "description" "text" not null,
    "event_id" "uuid" not null,
    "presentation_time" integer not null,
    "created_by" "text" not null
);

alter table "public"."Talks" owner to "postgres";

alter table only "public"."Talks"
    add constraint "Talks_pkey" primary key ("id");

create index "Talks_event_id_idx" on "public"."Talks" using "btree" ("event_id");

alter table only "public"."Talks"
    add constraint "Talks_event_id_fkey"
    foreign key ("event_id") references "public"."Events"("id")
    on update cascade
    on delete restrict;

alter table "public"."Talks" enable row level security;

create policy "Public can read talks"
on "public"."Talks"
as permissive
for select
to anon, authenticated
using (true);

revoke all on table "public"."Talks" from anon, authenticated;
grant all on table "public"."Talks" to "service_role";
grant select on table "public"."Talks" to "anon";
grant select on table "public"."Talks" to "authenticated";

create table "public"."SpeakerOnTalk" (
    "id" "uuid" default "gen_random_uuid"() not null,
    "speaker_id" "uuid" not null,
    "talk_id" "uuid" not null
);

alter table "public"."SpeakerOnTalk" owner to "postgres";

alter table only "public"."SpeakerOnTalk"
    add constraint "SpeakerOnTalk_pkey" primary key ("id");

alter table only "public"."SpeakerOnTalk"
    add constraint "SpeakerOnTalk_speaker_id_talk_id_key" unique ("speaker_id", "talk_id");

create index "SpeakerOnTalk_speaker_id_idx" on "public"."SpeakerOnTalk" using "btree" ("speaker_id");
create index "SpeakerOnTalk_talk_id_idx" on "public"."SpeakerOnTalk" using "btree" ("talk_id");

alter table only "public"."SpeakerOnTalk"
    add constraint "SpeakerOnTalk_speaker_id_fkey"
    foreign key ("speaker_id") references "public"."People"("id")
    on update cascade
    on delete cascade;

alter table only "public"."SpeakerOnTalk"
    add constraint "SpeakerOnTalk_talk_id_fkey"
    foreign key ("talk_id") references "public"."Talks"("id")
    on update cascade
    on delete cascade;

alter table "public"."SpeakerOnTalk" enable row level security;

create policy "Public can read speaker talks"
on "public"."SpeakerOnTalk"
as permissive
for select
to anon, authenticated
using (true);

revoke all on table "public"."SpeakerOnTalk" from anon, authenticated;
grant all on table "public"."SpeakerOnTalk" to "service_role";
grant select on table "public"."SpeakerOnTalk" to "anon";
grant select on table "public"."SpeakerOnTalk" to "authenticated";

insert into "public"."Talks" (
    "title",
    "description",
    "event_id",
    "presentation_time",
    "created_by"
)
select
    'Modern Angular in practice',
    'covering Angular v20, v21, and real-world patterns teams are adopting today. Expect practical insights into the latest framework features, improved developer experience, and how AI tools are starting to integrate into Angular workflows — from productivity boosts to smarter UI behavior.',
    e."id",
    30,
    'Mateusz'
from "public"."Events" e
where e."title" = 'Angular Zurich February 2026';

insert into "public"."Talks" (
    "title",
    "description",
    "event_id",
    "presentation_time",
    "created_by"
)
select
    'Angular Signal Forms',
    'The missing piece in Angular’s Signals transformation. You’ll learn why forms needed a rethink, how Signal Forms fit into Angular’s new reactive model, and what this means for building more predictable, performant, and maintainable form-heavy applications.',
    e."id",
    30,
    'Mateusz'
from "public"."Events" e
where e."title" = 'Angular Zurich February 2026';

insert into "public"."SpeakerOnTalk" (
    "speaker_id",
    "talk_id"
)
select
    p."id",
    t."id"
from "public"."People" p
join "public"."Talks" t on t."title" = 'Modern Angular in practice'
where p."slug" = 'mateusz-halada';

insert into "public"."SpeakerOnTalk" (
    "speaker_id",
    "talk_id"
)
select
    p."id",
    t."id"
from "public"."People" p
join "public"."Talks" t on t."title" = 'Angular Signal Forms'
where p."slug" = 'tomas-trajan';

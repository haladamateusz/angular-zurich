create or replace view "public"."former_organizers_public"
with ("security_invoker"='true') as
select distinct
    "p"."first_name",
    "p"."last_name",
    "p"."slug",
    "p"."picture_url",
    "p"."personal_url",
    "p"."github_url",
    "p"."twitter_url",
    "p"."linkedin_url"
from "public"."PeopleOnRoles" "r"
join "public"."People" "p" on "p"."id" = "r"."person_id"
where "r"."role" = 'FORMER_ORGANIZER'::"public"."ROLES";

create or replace view "public"."organizers_public"
with ("security_invoker"='true') as
select distinct
    "p"."first_name",
    "p"."last_name",
    "p"."slug",
    "p"."picture_url",
    "p"."personal_url",
    "p"."github_url",
    "p"."twitter_url",
    "p"."linkedin_url"
from "public"."PeopleOnRoles" "r"
join "public"."People" "p" on "p"."id" = "r"."person_id"
where "r"."role" = 'ORGANIZER'::"public"."ROLES";

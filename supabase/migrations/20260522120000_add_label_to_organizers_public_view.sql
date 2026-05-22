drop view if exists "public"."organizers_public";

create view "public"."organizers_public"
with ("security_invoker" = 'true') as
select distinct
  "p"."first_name",
  "p"."last_name",
  "p"."slug",
  "p"."picture_url",
  "p"."label",
  "p"."company_name",
  "p"."personal_url",
  "p"."github_url",
  "p"."twitter_url",
  "p"."linkedin_url"
from "public"."PeopleOnRoles" "r"
join "public"."People" "p" on "p"."id" = "r"."person_id"
where "r"."role" = 'ORGANIZER'::"public"."ROLES";

grant all on table "public"."organizers_public" to "anon";
grant all on table "public"."organizers_public" to "authenticated";
grant all on table "public"."organizers_public" to "service_role";

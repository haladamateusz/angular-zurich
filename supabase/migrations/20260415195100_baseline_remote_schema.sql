


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."ROLES" AS ENUM (
    'FORMER_ORGANIZER',
    'ORGANIZER',
    'SPEAKER'
);


ALTER TYPE "public"."ROLES" OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."People" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "slug" "text" NOT NULL,
    "email" "text" NOT NULL,
    "abstract" "text",
    "personal_url" "text",
    "twitter_url" "text",
    "linkedin_url" "text",
    "github_url" "text",
    "picture_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."People" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."PeopleOnRoles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "person_id" "uuid" NOT NULL,
    "role" "public"."ROLES" NOT NULL
);


ALTER TABLE "public"."PeopleOnRoles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."former_organizers_public" WITH ("security_invoker"='true') AS
 SELECT DISTINCT "p"."first_name",
    "p"."last_name",
    "p"."slug",
    "p"."picture_url"
   FROM ("public"."PeopleOnRoles" "r"
     JOIN "public"."People" "p" ON (("p"."id" = "r"."person_id")))
  WHERE ("r"."role" = 'FORMER_ORGANIZER'::"public"."ROLES");


ALTER VIEW "public"."former_organizers_public" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."organizers_public" WITH ("security_invoker"='true') AS
 SELECT DISTINCT "p"."first_name",
    "p"."last_name",
    "p"."slug",
    "p"."picture_url"
   FROM ("public"."PeopleOnRoles" "r"
     JOIN "public"."People" "p" ON (("p"."id" = "r"."person_id")))
  WHERE ("r"."role" = 'ORGANIZER'::"public"."ROLES");


ALTER VIEW "public"."organizers_public" OWNER TO "postgres";


ALTER TABLE ONLY "public"."PeopleOnRoles"
    ADD CONSTRAINT "PeopleOnRoles_person_id_role_key" UNIQUE ("person_id", "role");



ALTER TABLE ONLY "public"."PeopleOnRoles"
    ADD CONSTRAINT "PeopleOnRoles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."People"
    ADD CONSTRAINT "People_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."People"
    ADD CONSTRAINT "People_slug_key" UNIQUE ("slug");



CREATE INDEX "PeopleOnRoles_person_id_idx" ON "public"."PeopleOnRoles" USING "btree" ("person_id");



ALTER TABLE ONLY "public"."PeopleOnRoles"
    ADD CONSTRAINT "PeopleOnRoles_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."People"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE "public"."People" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."PeopleOnRoles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "Public can read organizer roles" ON "public"."PeopleOnRoles" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Public can read person" ON "public"."People" FOR SELECT TO "authenticated", "anon" USING (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON TABLE "public"."People" TO "service_role";
GRANT SELECT ON TABLE "public"."People" TO "anon";
GRANT SELECT ON TABLE "public"."People" TO "authenticated";



GRANT ALL ON TABLE "public"."PeopleOnRoles" TO "service_role";
GRANT SELECT ON TABLE "public"."PeopleOnRoles" TO "anon";
GRANT SELECT ON TABLE "public"."PeopleOnRoles" TO "authenticated";



GRANT ALL ON TABLE "public"."former_organizers_public" TO "anon";
GRANT ALL ON TABLE "public"."former_organizers_public" TO "authenticated";
GRANT ALL ON TABLE "public"."former_organizers_public" TO "service_role";



GRANT ALL ON TABLE "public"."organizers_public" TO "anon";
GRANT ALL ON TABLE "public"."organizers_public" TO "authenticated";
GRANT ALL ON TABLE "public"."organizers_public" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";








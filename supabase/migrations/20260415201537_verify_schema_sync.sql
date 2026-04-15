drop policy "Public can read person" on "public"."People";

drop policy "Public can read organizer roles" on "public"."PeopleOnRoles";


  create policy "Public can read person"
  on "public"."People"
  as permissive
  for select
  to anon, authenticated
using (true);



  create policy "Public can read organizer roles"
  on "public"."PeopleOnRoles"
  as permissive
  for select
  to anon, authenticated
using (true);




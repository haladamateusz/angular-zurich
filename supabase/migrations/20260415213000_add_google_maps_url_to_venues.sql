alter table "public"."Venues"
    add column "google_maps_url" "text";

update "public"."Venues"
set "google_maps_url" = 'https://maps.app.goo.gl/6T3uzXKmLJyKMWwKA'
where "title" = 'Constructor Nexademy'
  and "street" = 'Foerrlibuckstrasse 150';

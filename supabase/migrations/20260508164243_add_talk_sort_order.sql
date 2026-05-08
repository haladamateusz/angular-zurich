alter table public."Talks"
add column if not exists "sort_order" integer not null default 0;

with ranked as (
  select
    id,
    row_number() over (
      partition by event_id
      order by title asc, id asc
    ) * 10 as talk_sort_order
  from public."Talks"
)
update public."Talks" t
set "sort_order" = ranked.talk_sort_order
from ranked
where t.id = ranked.id;

with desired_order as (
  select
    e.id as event_id,
    ordered.title,
    ordered.sort_order
  from public."Events" e
  cross join (
    values
      ('Even moar Angular skills for agentic development', 10),
      ('From Typos to Type Safety — Building a Typed Router for Angular', 20),
      ('Angular 22: The Great Simplification', 30)
  ) as ordered(title, sort_order)
  where e.meetup_url = 'https://www.meetup.com/angularzrh/events/314674902/'
)
update public."Talks" t
set "sort_order" = desired_order.sort_order
from desired_order
where t.event_id = desired_order.event_id
  and t.title = desired_order.title;

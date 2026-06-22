update public."Talks" t
set slides_url = 'https://docs.google.com/presentation/d/1F63ib9MSYn6xDZKnmEzgEowUYJMY7ix7PhjQeD45NE0/edit?usp=sharing'
where t.title = 'Modern Angular in practice'
  and exists (
    select 1
    from public."Events" e
    where e.id = t.event_id
      and e.title = 'Angular Zurich February 2026'
  );

update public."Talks" t
set slides_url = 'https://docs.google.com/presentation/d/1OFiZRjDEFiXSihmYojcgwvuPEOEL6b4W0BmoRt_DBHU/edit?usp=sharing'
where t.title = 'Angular Signal Forms'
  and exists (
    select 1
    from public."Events" e
    where e.id = t.event_id
      and e.title = 'Angular Zurich February 2026'
  );

update public."Talks" t
set slides_url = 'https://docs.google.com/presentation/d/1XpNwr0A50ADy-983bCYSh8zWdLKnVxMkUc7jUCClqUk/edit?usp=sharing'
where t.title = 'Gone without a Zone - Understanding Zoneless Angular'
  and exists (
    select 1
    from public."Events" e
    where e.id = t.event_id
      and e.title = 'Angular Zurich April 2026'
  );

update public."Talks" t
set slides_url = 'https://docs.google.com/presentation/d/14vmCWbmOkHSwDmVY8HBzm8WHWLrLyNPFto1P-M5O8mU'
where t.title = 'Embracing agentic future with Angular Skills & MCP'
  and exists (
    select 1
    from public."Events" e
    where e.id = t.event_id
      and e.title = 'Angular Zurich April 2026'
  );

update public."Talks" t
set slides_url = 'https://docs.google.com/presentation/d/19k-OEj29RXmITwIoZDa9-bZTXHCda_0sbV3I-Q8wNdw/edit?usp=sharing'
where t.title = 'Angular 22: The Great Simplification'
  and exists (
    select 1
    from public."Events" e
    where e.id = t.event_id
      and e.title = 'Angular Zurich June 2026'
  );

update public."Talks" t
set slides_url = 'https://docs.google.com/presentation/d/151azFrlS0TCxdkoLy4YGkFhJGb9HBivA_ZGSVkxkHb8'
where t.title = 'Even moar Angular skills for agentic development'
  and exists (
    select 1
    from public."Events" e
    where e.id = t.event_id
      and e.title = 'Angular Zurich June 2026'
  );

update public."Talks" t
set slides_url = 'https://dominicbachmann.github.io/talks/2026-angular-typed-router/'
where t.title = 'From Typos to Type Safety — Building a Typed Router for Angular'
  and exists (
    select 1
    from public."Events" e
    where e.id = t.event_id
      and e.title = 'Angular Zurich June 2026'
  );

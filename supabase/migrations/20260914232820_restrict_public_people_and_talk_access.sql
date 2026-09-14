begin;

-- Public profiles remain readable, but contact information must not be available
-- through the underlying table (including filters and SELECT *).
revoke all on table public."People" from public, anon, authenticated;
revoke select (email) on table public."People" from public, anon, authenticated;

grant select (
  id, first_name, last_name, slug, abstract, personal_url, twitter_url,
  linkedin_url, github_url, picture_url, created_at, label, company_name
) on table public."People" to anon, authenticated;

-- Organizer contact reads continue through organizer_talk_submissions and
-- privileged workflow functions; service_role retains its existing privileges.
comment on column public."People".email is
  'Private contact information. Not readable by browser roles; use authorized submission workflows.';

-- A private event must also hide its talks when queried directly. Unassigned
-- talks are organizer work in progress, not published website content.
drop policy "Public can read talks" on public."Talks";

create policy "Public can read published talks"
on public."Talks" for select to anon
using (
  exists (
    select 1 from public."Events" event
    where event.id = "Talks".event_id and event.public
  )
);

create policy "Authenticated can read published talks or manage talks"
on public."Talks" for select to authenticated
using (
  (select private.can_current_user_read_talk_submissions())
  or exists (
    select 1 from public."Events" event
    where event.id = "Talks".event_id and event.public
  )
);

-- Follow the talk's RLS rules so direct join-table reads cannot reveal hidden
-- talk IDs or speaker assignments. Organizers can still see every assignment.
drop policy "Public can read speaker talks" on public."SpeakerOnTalk";

create policy "Readers can read visible talk speakers"
on public."SpeakerOnTalk" for select to anon, authenticated
using (
  exists (
    select 1 from public."Talks" talk
    where talk.id = "SpeakerOnTalk".talk_id
  )
);

commit;

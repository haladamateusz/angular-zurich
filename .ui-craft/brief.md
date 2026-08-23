# Design Brief

## Product purpose

Publishes the information people need to discover and attend Angular meetups in Zurich, while giving organisers private tools to review talks and publish events.

## Primary user

A prospective meetup attendee, usually browsing on a phone or laptop before an event, who needs to confirm the speakers, venue, date, time, and available past-talk slides.

## Principles

1. **One event, all the essentials.** Date, venue, speakers, and talk details must be immediately scannable; visual decoration never delays the decision to attend.

2. **Meetup owns attendance.** This site informs and directs people to Meetup.com; it does not recreate RSVP, membership, or attendance management.

3. **Public clarity, private control.** Attendees get useful information without an account, while talk review and event publishing remain focused, private tools for organisers.

4. **Consistency is a trust signal.** Equivalent cards, buttons, and destructive actions behave and appear consistently across public pages and admin workflows; headings and UI labels use sentence case.

## Success metric for the surface

A visitor opens the upcoming event, verifies the essential details, and continues to Meetup.com to RSVP. The desired outcome is at least 40 in-person attendees per event; referral clicks are not currently instrumented.

## Out of scope

- Does not let attendees RSVP, join the meetup, or manage attendance on this site.
- Does not provide public attendee accounts.
- Does not synchronize an internal event database with Meetup.com.
- Does not expose talk-submission review or event-management tools publicly.
- Does not provide a separate browsable past-events archive; the three past events appear on the home page.

## Learned constraints

- **2026-08-23** — Use sentence case for headings and UI labels; avoid decorative uppercase. *Why:* it reads as generic template language.
- **2026-08-23** — Place equivalent edit and delete actions consistently across talk-submission and event workflows. *Why:* organisers should not need to relearn controls between related tasks.
- **2026-08-23** — Reuse one card and button language across pages. *Why:* consistency should carry the visual system; any exceptions must serve a distinct purpose.

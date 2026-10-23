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
- Does not provide a browsable event archive for events before February 2026, because that historical data is incomplete.

## Learned constraints

- **2026-10-23** — Keep the scrollable chat history directly on the page, with only the bottom composer in a card. Put icon-only controls inside the input area on the right, with accessible names. _Why:_ the user wants a lighter conversation surface and compact input controls. This supersedes the earlier text-only send-button preference.

- **2026-10-23** — Fill the available viewport with the chat on entry and keep its composer anchored below an independently scrolling transcript. Preserve the transcript and draft editor when browser focus or same-user session credentials change. _Why:_ loading flashes, lost reading position, and an input that moves with content interrupt the conversation.

- **2026-10-22** — Keep sent chat bubbles and their text at their final size throughout the send animation; use translation and a brief fade instead of scaling from the composer dimensions. _Why:_ stretching text and changing the bubble's aspect ratio makes the transition feel distorted.

- **2026-10-17** — Match the chat header mascot's shield height and position across Wave, Thinking, and Coding; size against the character body rather than question marks or the floating console. _Why:_ transitions between poses should not make the character visibly grow, shrink, or shift sideways.

- **2026-10-17** — Keep Cheerful at full size on the ground with level, correctly oriented soles. Reveal props individually with short travel and rotation; each prop pops to 150% on entry, then settles at 100%. _Why:_ the user requested a brief individual size pop while keeping the body full size and avoiding the props behaving like one scaling background. This supersedes the earlier ban on prop scaling.

- **2026-10-16** — Use Orthos Front's upright leg and flat shoe contours throughout Cheerful's jump, centering each ankle over its shoe. Swing each leg and shoe together with rigid 2D rotation around the hip; do not morph or twist the shapes. _Why:_ the user wants consistent leg shapes and continuous ankle-to-shoe alignment while preserving the flat 2D leg swing. This supersedes translating the legs without rotation.

- **2026-10-16** — In mascot animations, lean the upper body and extend the legs slightly with the movement, keeping their lower anchors and both feet fixed on the ground. _Why:_ the user wants the legs to enlarge with the lean while maintaining a planted stance.

- **2026-10-16** — Keep the Coding mascot's moving hand behind the console, matching the static artwork. _Why:_ the user wants the animation to preserve the original overlap and depth.

- **2026-10-16** — For the Question mascot, scratch the side of the head with a short bent arm; fade out the original question mark as the extra marks appear, then restore it at rest. _Why:_ the user rejected the long reach over the head and wants the marks to form a sequence rather than remain visible together.

- **2026-10-16** — For the Orthos wave, mirror the original rounded thumb contour from the lower edge to the upper edge early in the hand raise; keep the palm orientation stable. _Why:_ the user rejected the wrist flip and wants the same thumb shape on the opposite side, appearing earlier in the gesture.

- **2026-10-05** — Show the written answer below result cards/tables and stream actual provider text as it arrives. Fold search activity once results are ready, keep Stop available through generation, and preserve interrupted text. _Why:_ readers should see both the evidence and a direct answer, with visible progress throughout.

- **2026-09-18** — Chat sends on Enter (Shift+Enter inserts a line), with a text-only send button. Show actual tool activity as it happens, including inspectable parameters and outcomes. Keep it inside each response above the answer, open while running and automatically folded when finished; users can expand previous searches. _Why:_ users need keyboard fluency and visible evidence of progress instead of a static searching label.

- **2026-08-23** — Use sentence case for headings and UI labels; avoid decorative uppercase. _Why:_ it reads as generic template language.
- **2026-08-23** — Place equivalent edit and delete actions consistently across talk-submission and event workflows. _Why:_ organisers should not need to relearn controls between related tasks.
- **2026-08-23** — Reuse one card and button language across pages. _Why:_ consistency should carry the visual system; any exceptions must serve a distinct purpose.

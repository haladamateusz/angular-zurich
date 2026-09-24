# Design Decisions

<!-- Lazy-loaded — loaded only when a task requires prior rationale or decision reference.
     Append-only log. Never delete entries; mark superseded ones with a note.
     Format: ### YYYY-MM-DD — {title} followed by **Status**: accepted | rejected | tried -->

Existing product principles and learned constraints are recorded in [the design brief](brief.md).
Add new decisions here only when an actual design choice needs additional rationale.

<!-- Add new decisions above this comment, newest first. -->

### 2026-09-18 — Observable archive activity and speaker counts

**Status**: accepted

Show compact, expandable activity rows above the composer so running tools remain
visible when the transcript is scrolled. Stream real execution events with durations
and bounded lookup details; never simulate private reasoning. Respect reduced motion.
Speaker count summaries come from database aggregates rather than counting displayed
cards, and distinguish past from upcoming events. Use a text-only send button with
Enter/Shift+Enter keyboard help.

### 2026-09-18 — Archive chat with source cards

**Status**: accepted

Use native Angular controls in a lazy feature, with AG-UI transport and CopilotKit's
server agent. The prebuilt Angular chat package was tried and removed after its root
provider pulled roughly 10 MB of development JavaScript into the initial bundle.
Render verified published records as source cards using existing typography, surfaces,
and link tokens. Use `--foreground-link` for source links: the action background token
does not meet text contrast requirements in dark mode. Opening the page and selecting
an example question never starts a model request.

## 2026-09-24 — Archive result types and conversation continuity

Keep the existing chat composition and expandable activity disclosure. Standard AG-UI activity snapshots drive the same disclosure; completed searches stay folded above the answer. Render verified speaker rankings and year counts as semantic tables using existing typography, spacing and border tokens. Context remains in memory as a short-lived server-issued token; Stop retains the thread and New chat/account changes clear it. Only the latest reply exposes its contextual next-page action, labelled “Prepare next page” because it fills the composer for review.

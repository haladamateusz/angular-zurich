# Archive chat setup

The implementation runs in the existing Angular SSR/Express application. No Mastra,
Copilot Cloud, new Supabase project, or separate backend host is required.

## Accounts and secrets

1. Create an [OpenRouter account and API key](https://openrouter.ai/settings/keys),
   add a small credit balance, and put a hard spending limit on a dedicated key.
   The only model configured is `openai/gpt-5.6-luna`; there is no model fallback.
2. Copy `.env.example` to `.env.local`. Fill `OPENROUTER_API_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, and `SUPABASE_KEY` for the same
   Supabase project used by the frontend. Keep `CHAT_ENABLED=false` until the
   migration is applied. Never put privileged keys in `src/environments/`, browser
   configuration, a Git commit, or a chat message.
3. Use the existing Google approval list in `private.allowed_google_accounts`.
   An active entry is required. Signing in alone does not grant chat access.
   Deactivation blocks subsequent model calls and archive lookups without waiting
   for the JWT to expire.

The browser uses its existing Supabase configuration. The service-role key is used
only by backend quota operations and explicitly confirmed event publication.
Archive reads and private draft edits use the caller's verified session.

## Local development

The new migration is
`supabase/migrations/20260917162250_add_approved_chat_search_and_limits.sql`.
It adds bounded search RPCs, a private quota ledger, and authorization helpers.
It does not modify or import existing talks. Search has no archive date cutoff.
`20260918125740_add_chat_speaker_archive.sql` adds direct speaker-name lookup,
exact totals, separate past/upcoming counts, and yearly breakdowns.
`20260919122753_add_chat_speaker_rankings.sql` adds whole-archive speaker rankings.
Apply all three migrations before using the speaker tools.
Only talks attached to published events are returned; older records absent from
Supabase still need a separate data backfill.

Start the local Supabase stack when testing against local data and apply migrations
using the project's normal Supabase workflow. The local-only regression checks run as:

```sh
docker exec -i supabase_db_angular-zurich \
  psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 \
  < supabase/tests/chat_access.sql
```

Set `CHAT_ENABLED=true` in `.env.local`, then run `npm run start:chat`. Open `/chat`
and sign in with an approved account. Both `npm start` and `npm run start:chat`
load `.env.local` for server-side configuration. Restart after changing environment variables.
Direct `ng serve` and IDE launches also load `.env.local` in the development SSR
entry point. Production reads only the hosting provider's environment variables.
The chatbot's code and tests can be developed without an OpenRouter key.

## Deployment in the existing Vercel project

Apply the reviewed migration to the target Supabase project before enabling chat.
Use the existing project deployment workflow; do not paste this SQL into a different
project. Set the same server environment variables in Vercel's intended environment
and redeploy. Verify that Fluid Compute is enabled: the configured 180-second
function duration accommodates the bounded 90-second model run plus auth/DB work.
[Vercel duration documentation](https://vercel.com/docs/functions/configuring-functions/duration).

Keep chat disabled on previews that point at production data. A preview using a
separate test database and key is the preferred place for the first paid-model test.
Verify `/api/chat/access`, `/api/chat/run` streaming, disconnect cancellation, source
links, and quota errors on Vercel before enabling production. Local mocked tests do
not prove remote provider availability, configured prices, or deployed streaming.

## Cost controls and behavior

- Opening the page, examples, and access checks do not call a model.
- 1 active run per user, 5 accepted runs per minute, 100 per UTC day.
- Each accepted run permanently reserves 10 US cents for that UTC day. With
  `CHAT_DAILY_BUDGET_CENTS=200`, the community gets at most 20 accepted runs/day.
  This is a conservative allocation, **not a claim that each question costs 10 cents**.
- No refunds on failures/cancellation: provider billing can be uncertain after a
  disconnect. Leases expire after two minutes if a process dies.
- At most 3 archive-selection model calls plus 1 final answer call, 800 output tokens/call, 40,000 serialized request bytes/call,
  8 archive calls/run, and 10 results/page. OpenRouter provider price ceilings are
  $0.20/M input tokens and $1.20/M output tokens. If no provider satisfies these
  ceilings, the request fails; it never silently upgrades to a more expensive model.
- `CHAT_ENABLED=false` disables inference. An OpenRouter key limit provides an
  independent overall spending limit; set it before enabling the feature.
- Only the last six user questions, capped at 6,000 characters in total, are forwarded
  as context. Client system messages, tool results, model choices and instructions
  are discarded. There is no saved conversation history or server-side thread replay.
- The agent selects retrieved IDs; the server validates the result and publishes source
  cards/tables first. One separate, tool-free model call then writes a short answer using
  only those published records and verified totals. Actual text deltas stream below the
  components through AG-UI; there is no simulated typing delay. Generated prose is an AI
  summary, not a separately verified database fact. It is rendered as escaped plain text,
  so model-written HTML and links cannot execute or create destinations.
- Clarifications, no-result and off-topic replies use fixed text without a synthesis call.
  Stop/disconnect cancels the provider; cards and partial prose remain with an incomplete
  label. Verified search context is sent before prose so follow-ups still work after Stop.
  Search activity folds when the cards are ready; the writing cursor lasts until text ends.
  The same 90-second run timeout, price ceilings, approval checks and 10-cent reservation
  cover both retrieval and the final answer call.

## Tools and MCP

`POST /api/chat/mcp` is a stateless MCP Streamable HTTP endpoint. It requires the same
Supabase bearer token and active approval as chat. An MCP client must manage token
refresh; a public OAuth/discovery flow is not included in this initial version.

Available tools: `search_talks`, `find_speakers`, `list_events`,
`plan_monthly_meetups`,
`get_talks_by_speaker`, `get_talks_by_event`, `get_talk`, `get_speaker_talks`,
`get_speaker_stats`, `rank_speakers`, `query_archive`, `list_talk_submissions`,
and `get_talk_submission`.
The archive agent invokes the archive handlers directly. It does not make an HTTP loopback
call to MCP, and it cannot add external servers or execute arbitrary SQL.
The event tools below can write private drafts; publication requires UI confirmation.
Search pages have ten entries and offsets are capped at 200. Narrow larger searches.
MCP lookups do not invoke a model or consume the model allowance.

`list_events` accepts optional title keywords (`query`) and inclusive `fromYear` /
`toYear` bounds on event dates in Europe/Zurich. For “give me events from 2021”, use
`query: "", fromYear: 2021, toYear: 2021`. Results include only public events,
ordered newest first, with ten per page. Follow-up pages retain the year filters.
This uses the existing Events API and requires no additional migration.

The two submission tools are available to MCP clients and the website's chat
agent. They require both active chat approval and organizer
submission access, checked on every call. Reads use the caller's JWT and the existing
`organizer_talk_submissions` security-invoker view/RLS. No migration is required.

- `list_talk_submissions`: optional `title`, `speaker`, `status`, `offset` (0–10,000),
  and `limit` (1–20, default 10). Title/speaker filters match literal substrings;
  `*` is rejected. Returns `items`, `hasMore`, and `nextOffset`; narrow the filters
  if `hasMore` is true but the offset cap makes `nextOffset` null. Ordering is newest
  first with ID as a stable tie breaker. Items contain ID, creation date, status,
  talk title, speaker name and label.
- `get_talk_submission`: requires `submissionId` from the list. Returns `item` with
  the same fields plus the full description and slides URL, or `item: null` when
  absent. Contact emails, edit tokens, storage paths and review history are excluded.

Example MCP `tools/call` parameters:

```json
{ "name": "list_talk_submissions", "arguments": { "status": "approved", "limit": 10 } }
```

Status values are `initially_submitted`, `adjusted`, `changes_requested`,
`changes_submitted`, `approved`, `rejected`, and `assigned_to_event`. Submission text
and links are untrusted content, not instructions. These tools only read proposals;
they do not approve, publish or assign talks, or fetch submitted links.

The additional filter `awaiting_review` groups `initially_submitted`, `adjusted`
and `changes_submitted`; `changes_requested` waits on the speaker. A null status
means all statuses. Ask “Do we have any talk submissions awaiting review?” in chat
to see up to ten proposals with dashboard links. Displayed page lengths are not
reported as queue totals. Submission answers are rendered from retrieved records
without another model call. Follow-up pages and IDs use encrypted verified context.
Feedback can store these results, but the current feedback evaluation runner is
limited to published-archive cases; keep submission cases as drafts for manual review.

Chat rejects non-stream success responses and handles non-JSON HTTP failures with
a retry message. Server-side chat-router load errors also return JSON, preventing
HTML error pages from surfacing as raw JSON parser messages in the conversation.

`rank_speakers` answers “Who gave the most talks?” with database totals computed
before pagination. It counts distinct talks at past public events across all stored
years, excludes upcoming/private events, and credits each co-presenter once per talk.
Ties share a rank. The answer is rendered from validated database counts; it does
not require the model to invent talk IDs for an aggregate result.

Speaker tools take a name directly and calculate totals over the full published
archive, independently of the ten-record page size. Upcoming events are counted
separately from past events. Multiple matching speakers require clarification.
The final model turn is reserved for selecting sources; unfinished lookups and
tool failures return an error rather than claiming no records exist.

The composer sends on Enter and inserts a newline on Shift+Enter. IME composition
does not submit. Search activity streams tool names, bounded parameters, completion
counts, duration, and failure state as tools execute. These are observable actions,
not private model reasoning. Expand an activity row for details. No raw model
reasoning or arbitrary tool-output payload is exposed.

## Private event drafts and publication

Apply `20261015222331_add_chat_event_drafts.sql` before running this workflow.
Applied locally and to the linked Supabase project on 16 October 2026 after the
database, API and browser checks. Application deployment remains a separate step.
It adds private draft/audit tables and a public event description column. Drafts
are shared between currently approved organizers and survive closing the chat.
Drafts open in the editor when returned by chat or through a direct draft link.

The website agent and MCP endpoint expose these additional tools:

- `get_event_options`: known venues, speakers and unassigned approved talks.
- `create_event_draft`: persist a private draft; MCP clients supply a stable conversation `threadId`.
- `get_event_draft`: load current content and version.
- `update_event`: edit private draft fields using the expected version.
- `create_talk_draft`: add a new private talk using existing speaker IDs.
- `attach_talk_to_event`: select an approved, unassigned talk.
- `publish_event`: **prepare review only**; return the preview (or an MCP review link).
- `discard_event_draft`: discard a private draft without deleting existing talks or events.

Example prompt:

> Create a private Angular Zürich meetup for 12 November 2026 at 18:00. Draft a
> talk about agentic Angular UIs for Mateusz Halada and a talk about Angular
> architecture for Tomas Trajan. Use Constructor Nexademy if it is available.
> Prepare everything for review.

The assistant resolves real IDs and asks for a date when it is missing. Dates are
interpreted in Europe/Zurich. The preview lets organizers edit the event title,
description, date/time, venue, Meetup URL and optional image URL, add/remove talks,
and inspect the audit history. New talk descriptions can be revised by removing
and re-adding the talk. New talks default to 40 minutes. This workflow uses known
speaker profiles; it does not create people or send notifications.

Schedule clarifications retain the known date, time and proposed title in the
encrypted conversation context. The next question asks only for missing fields;
time-only replies continue the pending plan. Without an explicit year, planning
uses the next occurrence of the requested date. “As usual” looks for a start time
shared by at least two and 60% of the five latest past published events, converted
to Europe/Zurich; otherwise the assistant asks for the time. Once a draft exists,
follow-ups edit that draft. The creation tool is unavailable unless the latest
message explicitly asks to create/plan another event.

Run `npm run eval:event-planning` to replay the four-turn November conversation
against the real OpenRouter model and synthetic database data, including a
100-person options response, plus the monthly-capacity question. These five runs
reserve at most $0.50 under the
normal per-run caps. This evaluation cannot publish an event and is not part of
automatic CI.

Verified on 19 October 2026: the four-turn real-model planning replay passed,
retaining 25 November 2026 at 18:00 and creating only one private draft. Six
existing read-only archive model evaluations also passed. These checks used
synthetic database data; no production event was created or published.

`plan_monthly_meetups` handles hypothetical monthly scheduling through the end of
the current year without creating drafts. It reports calendar capacity both
including the current month and starting next month, then separately counts
remaining months with no published event. Counts are exact and grouped by
calendar month in Europe/Zurich, including events earlier in the current month;
multiple events in one month occupy one monthly slot. The tool performs at most
twelve bounded count requests and does not infer venue/speaker availability or
include private drafts. Database errors are not reported as empty months. Its
answer is deterministic and needs no extra model call or source-ID selection.
Verified on 19 October 2026 with the exact monthly-capacity question against the
real model, both in a fresh conversation and with an existing draft in context.
Both runs selected the capacity tool and completed in one model call, using
synthetic published-event counts and making no draft writes.

Publication requires a future date, a valid venue, an HTTPS Meetup URL, and two or
three talks with valid speakers. Save edits, select **Review publication**, inspect
the exact event and talks, then select **Publish event publicly**. Publication
creates the event and any new talks atomically, assigns approved existing talks,
and makes the event visible. The reviewed description appears on the public event
page. Drafting creates no public event or new public talk records.

The review endpoint issues a five-minute signature bound to the organizer, draft
ID and version. The publish endpoint requires both that signature and explicit
confirmation, rechecks organizer access, and calls a service-role-only database
function. The model and MCP tools never receive a signature or access that
function. Typing “publish” in chat cannot replace the UI confirmation.

Every successful change records the actor, version, action and private snapshot.
Concurrent edits invalidate stale versions and approvals; reload and review again.
Publication also rechecks that existing talks are unchanged, approved and unassigned.
Retries reuse the same event; repeating creation with the same organizer,
conversation, title and date reuses the draft. **Discard** only affects private
drafts; public events continue to use the existing organizer management screens.

Event preparation permits up to eight model calls and twelve draft operations per
request, with the same timeout, provider price ceilings, byte/token caps and quota
reservation. After entering event preparation, the agent receives only event tools
on subsequent steps. Preview, editing, review and publication do not invoke a model.
Feedback may capture draft results, but automated feedback evaluation remains
read-only and limited to archive questions; review event-workflow cases manually.

Run `npm run test:chat`, the SQL check documented in `supabase/tests/README.md`, and
`npm run test:chat:browser -- scripts/chat/event-draft.e2e.ts`. The browser check
mocks the backend and model; it verifies editing, review, stale approvals and
publication with desktop/mobile accessibility checks. It does not publish a real
event or prove live OpenRouter behavior.

## Verification

### Answer feedback

Completed answers offer **Useful** and **Not quite** buttons. A user can change
their vote or choose **Remove feedback**. Feedback saves do not call a model or
consume the chat allowance. Interrupted answers do not offer feedback.

Apply `20261015162745_add_chat_feedback.sql` before deploying this feature.
Applied to the linked project on 15 October 2026 after local policy tests and
a dry run confirmed it was the only pending migration.
`POST /api/chat/feedback` checks the existing session and current chat approval,
then writes with that user's Supabase client. Row-level security permits approved
users to read, insert, update, and delete only their own feedback. There is one
row per user and answer; retrying or changing a vote updates that row. Removing
feedback deletes the row and its saved context.

Review feedback in the Supabase Dashboard table editor under
`public.chat_feedback`, or run this in the Dashboard SQL editor:

```sql
select created_at, updated_at, user_id, rating, question, answer, source_ids, result
from public.chat_feedback
order by updated_at desc;
```

The table stores the rated question/answer pair, source IDs, structured results
(including rankings/statistics), thread/message IDs, the authenticated user ID,
and timestamps. It does not automatically persist unrated conversations.
Context is a client-reported snapshot for manual review, not a trusted agent
audit log or an automatic training dataset. The chat footnote discloses this
storage. Starting a new chat clears the displayed conversation; submitted
feedback remains in Supabase. Chat history is still not restored on reload.

Local access-policy checks (synthetic fixtures are rolled back):

```sh
docker exec -i supabase_db_angular-zurich \
  psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 \
  < supabase/tests/chat_feedback.sql
```

### Application checks

```sh
npm run test:chat
npm test -- --watch=false
npm run lint
npm run knip
npm run build
npm run test:browser-build
```

Browser checks use synthetic auth and intercepted API responses, never real model
credits. With a development environment configured:

```sh
npx playwright install chromium
npm run test:chat:browser
# Or use installed Chrome:
PLAYWRIGHT_CHANNEL=chrome npm run test:chat:browser
# Test an existing development server without starting another one:
PLAYWRIGHT_BASE_URL=http://localhost:4200 PLAYWRIGHT_CHANNEL=chrome npm run test:chat:browser
```

The database and API checks are included in CI. The browser checks additionally cover
source cards, anonymous access, quota/revocation states, keyboard focus, a mobile dark
layout, and axe accessibility checks. Screenshots and traces are written under ignored
`tmp/`. Run a separate approved-account live test after configuring secrets.

Verified locally on 18 September 2026: 132 Angular tests, 18 API/policy tests,
2 browser tests, database access/search/quota regression checks, lint, Knip,
production build, and browser credential scan passed. Axe reported no violations
on the chat surface in light desktop and dark mobile views. Dependency audit
reported zero vulnerabilities. The running SSR server returned 401 for anonymous
chat access.

Build warnings remain: the initial browser bundle is 668.62 kB against a 650 kB
warning threshold (below the 1 MB error limit), and server SDK dependencies produce
CommonJS warnings. The chat page is a separate lazy chunk, approximately 48 kB
compressed. The local database advisor reports an existing overlapping SELECT-policy
warning on Events; no new chat-schema warnings were reported.

On 18 September 2026, the chat migration was also applied to the linked hosted
Supabase project after confirming it was the only pending migration and that the
frontend and backend project URLs matched. Hosted checks confirmed anonymous
search is denied and the backend quota RPC rejects unknown users. The public
archive contained 58 talks. Both supplied Supabase keys and the OpenRouter key
were validated without printing secrets.

The speaker archive migration was subsequently applied to the hosted project and
verified locally for complete totals, year breakdowns, pagination, and access controls.

A real `openai/gpt-5.6-luna` request successfully selected `search_talks` with
`signals`, using the configured provider price/privacy restrictions. That isolated
94-token provider smoke test cost $0.0000388. Local chat is enabled in the ignored
`.env.local`, and an approved account reached the live chat on port 4200. The user
confirmed the live signals question returned talk cards; the linked November 2023
event opened successfully and contained Tomas Trajan's Angular Signals talk.
After adding development-only `.env.local` loading for direct CLI/IDE launches,
the user also confirmed that refreshing port 4200 restored the message box.
The new speaker-count flow has automated coverage; live user confirmation is pending.

Vercel deployment and deployed streaming remain unverified. The application has
not been deployed as part of this setup.

On 19 September 2026, the ranking migration passed local regression checks for
full-archive totals, ties, co-presenters, pagination, unpublished/upcoming exclusions,
and immediate revocation, then was applied to the hosted database. All 22 API/policy
tests, development build, and lint passed. A bounded live GPT-5.6 Luna smoke test
using isolated database fixtures selected `rank_speakers` for “Who gave the most
talks?” and produced the expected server-rendered ranking.

### Conversation context, diagnostics and evaluations

#### Turn feedback into regression cases

Feedback does not automatically change prompts, train a model, or affect the next
answer. Use the following manual workflow to turn a reported problem into a
repeatable check. These commands are separate from the synthetic `eval:chat` suite.

1. Export the latest “Not quite” votes using the server credentials in `.env.local`:

   ```sh
   npm run feedback:export
   # Subsequent exports must use a new filename to preserve reviewed cases:
   npm run feedback:export -- --out tmp/chat-feedback/new-cases.json --limit 100
   ```

   The export reads Supabase without changing feedback. It defaults to 100 rows,
   supports at most 500, and refuses to overwrite an existing file. Every case
   starts as `draft`. Raw user IDs and credentials are omitted; questions and
   answers remain private data. Files use owner-only permissions under ignored
   `tmp/chat-feedback/`. Exported snapshots are not updated when a vote changes.

2. Review `tmp/chat-feedback/cases.json`. Check the published archive to establish
   the correct outcome, describe it in `expectedBehavior`, and fill `expectations`.
   Rewrite follow-up questions so they make sense on their own: feedback does not
   store the encrypted conversation context. Set `standalone` to `true` and
   `status` to `ready` only after review. Leave unresolved cases as `draft`, or use
   `ignored` for cases you do not want to run. A disliked answer is not an oracle.

   Example expectations for a verified speaker total:

   ```json
   { "kind": "stats", "total": 7 }
   ```

   Replace the example number with a verified value. Other checks include
   `sourceIdsInclude`, `sourceIdsExclude`, `past`, `upcoming`, ranking rows with
   `id`/`rank`/`talkCount`, and case-insensitive `answerIncludes`/`answerExcludes`
   snippets. `kind` is required; talks, stats and ranking cases also need at least
   one explicit content check. `observed` preserves the original answer for review.
   See `scripts/chat/feedback-cases.example.json` for a complete synthetic example.

3. Validate the file without making database or model calls:

   ```sh
   npm run eval:feedback
   # Validate a different export or the supplied example:
   CHAT_FEEDBACK_CASES=scripts/chat/feedback-cases.example.json npm run eval:feedback
   ```

4. For a live run, set `CHAT_EVAL_ACCESS_TOKEN` in the ignored `.env.local` to your
   own short-lived Supabase access token from an approved organizer session.
   Do not use the service-role key as this token or share it in chat. The runner
   validates the session and approval before model calls; refresh it when expired.
   It also requires the existing `SUPABASE_URL`, `SUPABASE_KEY`, and
   `OPENROUTER_API_KEY`, and checks that the export belongs to that project.

   ```sh
   CHAT_FEEDBACK_LIVE=true CHAT_EVAL_LIMIT=6 CHAT_EVAL_BUDGET_CENTS=60 npm run eval:feedback
   ```

   Live execution is explicitly opt-in and spends OpenRouter credits. It runs at
   most 20 reviewed cases, requiring a conservative allowance of 10 cents per
   selected case (maximum $2). Existing agent request/token/provider-price caps
   apply. This allowance is a preflight guard, not a provider billing meter; this
   script does not use the HTTP chat route's daily quota ledger. It runs with the
   approved user's permissions against live published records. Its database
   client permits only the current archive read RPCs and user validation; table
   access and event mutations are blocked. Do not add paid evaluations to CI.

5. Inspect the private JSON report in `tmp/chat-feedback/reports/`, then change the
   prompt or tools and rerun the same cases. Reports preserve the original answer,
   new answer, explicit check failures, model, code fingerprint and token usage.
   Only the reviewed question goes to the agent, not the old answer or expected
   result. A pass means the specified checks passed, not that every sentence is
   correct; review prose yourself. Published data can change between runs, so
   revisit counts and source expectations when the archive changes.

On 15 October 2026 the first hosted export returned no “Not quite” votes. No
feedback-derived prompt correction or paid live feedback evaluation was made.

#### Existing archive evaluations

No additional account or secret is required for short-lived search context. The existing server-only service credential derives the context encryption key. A new chat/account resets context; Stop preserves it. Context expires after 30 minutes and no transcript is persisted. Never remove server approval checks based on possession of a context token.

Apply `20260923210337_chat_combined_filters.sql` before using combined speaker/topic/year filters. The RPC is invoker-security, approved-user-only and read-only.

`archive_run` JSON logs identify the run and completed tool timings. Successful runs include model-call counts and token usage when the provider reports it. `estimatedCostUsd` uses the configured maximum token prices, not actual invoice data; prompt caching can reduce charges. SDK raw request/error logging is disabled to keep questions and archive data out of logs.

Run offline checks with `npm run test:chat`, Angular tests and `npm run test:chat:browser`. Real-model checks are opt-in:

```sh
npm run eval:chat
CHAT_EVAL_LIMIT=20 CHAT_EVAL_BUDGET_CENTS=200 npm run eval:chat
```

The first command runs six fixed-data cases with a conservative 60-cent reservation. The full catalogue reserves $2 maximum; the normal three retrieval calls plus one answer call, 40 KB request and 800-output-token caps and provider price ceiling still apply. Evaluations use the configured OpenRouter key and a synthetic read-only archive, not production user accounts or database mutations. Do not add these paid calls to automatic CI without a separately agreed budget.

Verification on 24 September 2026: the migration was applied locally and to the linked Supabase project; transactional archive/access/quota regressions passed and the local security advisor reported no issues. The 20-case real-model evaluation pass succeeded after correcting nullable filter schemas and filtered-speaker tool guidance. Ordinary counts/rankings completed in one model call in that pass. Model evaluations are samples, not guarantees for every phrasing. Desktop/mobile light/dark browser checks and AXE checks passed using installed Chrome (`PLAYWRIGHT_CHANNEL=chrome npm run test:chat:browser`). Production still reports the existing initial-bundle warning and server dependency CommonJS warnings.

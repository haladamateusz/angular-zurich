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
only by the backend's quota client. Archive tools use the caller's verified session.

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
- 1 active run per user, 5 accepted runs per minute, 30 per UTC day.
- Each accepted run permanently reserves 10 US cents for that UTC day. With
  `CHAT_DAILY_BUDGET_CENTS=200`, the community gets at most 20 accepted runs/day.
  This is a conservative allocation, **not a claim that each question costs 10 cents**.
- No refunds on failures/cancellation: provider billing can be uncertain after a
  disconnect. Leases expire after two minutes if a process dies.
- At most 3 model calls, 800 output tokens/call, 40,000 serialized request bytes/call,
  8 archive calls/run, and 10 results/page. OpenRouter provider price ceilings are
  $0.20/M input tokens and $1.20/M output tokens. If no provider satisfies these
  ceilings, the request fails; it never silently upgrades to a more expensive model.
- `CHAT_ENABLED=false` disables inference. An OpenRouter key limit provides an
  independent overall spending limit; set it before enabling the feature.
- Only the last six user questions, capped at 6,000 characters in total, are forwarded
  as context. Client system messages, tool results, model choices and instructions
  are discarded. There is no saved conversation history or server-side thread replay.
- Model-written prose is never displayed. The agent selects retrieved IDs; the server
  builds text and source cards from published records. This deliberately prioritizes
  archive discovery over general conversation or generated coding advice.

## Tools and MCP

`POST /api/chat/mcp` is a stateless MCP Streamable HTTP endpoint. It requires the same
Supabase bearer token and active approval as chat. An MCP client must manage token
refresh; a public OAuth/discovery flow is not included in this initial version.

Available tools: `search_talks`, `find_speakers`, `list_events`,
`get_talks_by_speaker`, `get_talks_by_event`, `get_talk`, `get_speaker_talks`,
`get_speaker_stats`, and `rank_speakers`.
The agent invokes the same typed handlers directly. It does not make an HTTP loopback
call to MCP, and it cannot add external servers, execute SQL, or access write tools.
Search pages have ten entries and offsets are capped at 200. Narrow larger searches.
MCP lookups do not invoke a model or consume the model allowance.

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

## Verification

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

No additional account or secret is required for short-lived search context. The existing server-only service credential derives the context encryption key. A new chat/account resets context; Stop preserves it. Context expires after 30 minutes and no transcript is persisted. Never remove server approval checks based on possession of a context token.

Apply `20260923210337_chat_combined_filters.sql` before using combined speaker/topic/year filters. The RPC is invoker-security, approved-user-only and read-only.

`archive_run` JSON logs identify the run and completed tool timings. Successful runs include model-call counts and token usage when the provider reports it. `estimatedCostUsd` uses the configured maximum token prices, not actual invoice data; prompt caching can reduce charges. SDK raw request/error logging is disabled to keep questions and archive data out of logs.

Run offline checks with `npm run test:chat`, Angular tests and `npm run test:chat:browser`. Real-model checks are opt-in:

```sh
npm run eval:chat
CHAT_EVAL_LIMIT=20 CHAT_EVAL_BUDGET_CENTS=200 npm run eval:chat
```

The first command runs six fixed-data cases with a conservative 60-cent reservation. The full catalogue reserves $2 maximum; the normal three-call, 40 KB request and 800-output-token caps and provider price ceiling still apply. Evaluations use the configured OpenRouter key and a synthetic read-only archive, not production user accounts or database mutations. Do not add these paid calls to automatic CI without a separately agreed budget.

Verification on 24 September 2026: the migration was applied locally and to the linked Supabase project; transactional archive/access/quota regressions passed and the local security advisor reported no issues. The 20-case real-model evaluation pass succeeded after correcting nullable filter schemas and filtered-speaker tool guidance. Ordinary counts/rankings completed in one model call in that pass. Model evaluations are samples, not guarantees for every phrasing. Desktop/mobile light/dark browser checks and AXE checks passed using installed Chrome (`PLAYWRIGHT_CHANNEL=chrome npm run test:chat:browser`). Production still reports the existing initial-bundle warning and server dependency CommonJS warnings.

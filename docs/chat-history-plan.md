# Saved conversations and recent chats

Status: implemented in the working tree, 1 November 2026. Enable after applying the additive migration; see `docs/chatbot-setup.md`. The sections below record the agreed design.

## Goal and recommended scope

Let approved users return to their own conversations after a refresh, a new sign-in or a change of device, and continue from the saved context. Add a left-hand recent-chat sidebar using the current Angular Zürich design system.

Recommended v1 decisions:

- Store history in Supabase, private to its owner. Organizer access does not grant access to other users' chat history.
- Provide New chat, reopen, rename and delete. Generate the initial title from the first question, with whitespace normalized and a word-boundary length limit; no extra model call.
- Save questions, answers, result cards/tables, bounded activity summaries and completion status. Restore links to event drafts from their existing database records.
- Retain conversations until the owner deletes them or their account is deleted. Confirm this product default before rollout and explain it in the chat interface.
- Stop an active response when switching conversations. Background generation, live multi-device streaming, branching, public sharing, folders, pinning and full-text history search are outside v1.
- Browser storage may remember sidebar width/collapse preference; conversation content and credentials must not be stored there.

## Current implementation and implications

| Finding                                                                                                                | Implication                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ArchiveChatService` holds messages and result/activity maps in memory. `reset()` creates a fresh agent and thread ID. | Add a durable history service and explicit conversation hydration; replacing only the message array is insufficient.     |
| `context.ts` seals verified context into a user/thread-bound token that expires after 30 minutes.                      | Persist verified context on the server. Saving the existing token cannot support resuming days later.                    |
| The client sends up to six user questions, bounded to 6,000 characters.                                                | Preserve bounded model input; displaying a long saved transcript must not send the entire transcript to the model.       |
| `/api/chat/run` creates assistant IDs, emits results before prose, and cancels on disconnect.                          | Persist from the server lifecycle and retain existing streaming/cancellation behavior.                                   |
| Display IDs use `${questionId}-response`, while streamed answers have separate IDs.                                    | Define stable stored question/answer identities and explicitly map them to AG-UI and feedback IDs.                       |
| Event drafts already have `created_by`, `thread_id`, versions and an audit history.                                    | Reuse the thread ID and reload the latest authorized draft; do not copy editable draft state into transcript snapshots.  |
| Feedback already stores a copy of question/answer content.                                                             | Define deletion behavior for these copies, not just the visible transcript.                                              |
| Only `/chat` is currently declared as client-rendered.                                                                 | Add `/chat/:threadId` routes and a client rendering rule covering nested chat paths.                                     |
| The current chat column is capped at 64rem; app viewport styling targets `app-chat-page`.                              | Put the sidebar outside the capped conversation column and preserve the full-height app layout when introducing a shell. |

## Layout and interaction

Desktop, proposed starting breakpoint 1024px:

```text
┌──────────────────────────────────────────────────────────────┐
│ Existing site navigation                                     │
├─────────────────┬────────────────────────────────────────────┤
│ New chat   [‹]  │ Chräungie                                 │
│                 │                                            │
│ Today           │                                            │
│ Current chat ⋯  │ Conversation / existing welcome state      │
│ Another chat ⋯  │                                            │
│                 │ Independently scrolling transcript         │
│ Yesterday       │                                            │
│ Earlier chat ⋯  │                                            │
│                 ├────────────────────────────────────────────┤
│ Load more       │ Composer                         [Send]    │
└─────────────────┴────────────────────────────────────────────┘
```

Mobile and narrow tablet:

```text
┌────────────────────────────┐
│ [History]  Chräungie  [+]   │
├────────────────────────────┤
│                            │
│ Conversation               │
│                            │
├────────────────────────────┤
│ Composer          [Send]   │
└────────────────────────────┘
History opens a modal drawer with New chat and the recent list.
```

- Use an approximately 16rem desktop sidebar with its own scroll area. Keep the transcript directly on the page and the composer anchored below it, as required by the design brief.
- P0: active conversation, composer, New chat and access to History. On desktop, recent titles are also immediately visible. P1: rename/delete menu, older chats, collapsed tool details. No new settings screen is required.
- Group by Today, Yesterday, Previous 7 days and Older, using one explicit display timezone. Default to Europe/Zurich to match the app; store timestamps in UTC.
- Sort by last accepted message activity, newest first. Reading or renaming a conversation must not move it to the top. Use `(last_message_at, id)` as a stable cursor and fetch 30 threads at a time.
- Give each row a real navigation link and a separate menu button. Truncate visually while retaining the complete accessible title; indicate the selected link with `aria-current`.
- Start with the most recent 40 messages and allow loading earlier messages without moving the reader's scroll position. Preserve in-memory scroll/composer state when switching during the same signed-in session.
- New chat shows the existing welcome state at `/chat`; create a database conversation only when its first question is accepted. Use `/chat/:threadId` for saved conversations and browser Back/Forward navigation.
- Match the existing Lato/Montserrat typography, semantic surfaces, blue active/focus states, icons and theme behavior. Use brief drawer transitions with reduced-motion support; restored messages must not replay send animations.
- The mobile drawer traps focus, closes on Escape, restores focus to its trigger and prevents background interaction. Maintain usable touch targets and a visible composer with the software keyboard open.

## Persistence and security

Use three logical tables, preferably in the unexposed `private` schema, accessed through the authenticated Express API:

| Table               | Proposed contents                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat_threads`      | UUID matching AG-UI `threadId`, owner ID, title, created/updated timestamps, `last_message_at`, revision and required permission scopes.                       |
| `chat_messages`     | Stable ID, thread ID, sequence, role, text, run ID, response-to ID, timestamps, schema version, validated sources/result/activity payload and response status. |
| `chat_thread_state` | Thread ID, versioned server-verified archive context, context revision, active run/lease and last committed sequence. Never returned as editable client state. |

Constraints and access contract:

- Foreign keys cascade messages/state when a thread is deleted. Unique `(thread_id, sequence)` and run/message idempotency keys prevent duplicate turns. Index thread lists by owner and activity, and messages by thread and sequence.
- Enable RLS as defense in depth and revoke browser-role access to persistence tables. Use narrowly scoped, service-only RPCs for persistence; any exposed RPC wrapper must restrict execution and delegate to private implementation. The server derives the owner from the verified session, never request-supplied ownership.
- Because service-role operations can bypass RLS, every persistence operation must explicitly enforce ownership, current approval and required permissions. Keep this client outside all model tools; archive and draft tools continue using the caller's JWT.
- Track the union of organizer permission scopes used by a conversation before persisting privileged results. Losing a required scope hides that conversation, including its title, until access is restored. General archive conversations remain available to their approved owner.
- Validate referenced records on restore and before reuse as context. If a stored record is no longer accessible, redact the affected turn's answer, cards and activity together; a card-only filter would leave the same information in prose. Revalidate private draft access separately from conversation ownership.
- Persist only the user-visible, schema-validated result payload and bounded activity details. Do not save credentials, approval tokens, raw provider envelopes or unrestricted tool output.
- Keep responses `Cache-Control: no-store`. Clear all user-specific in-memory state on logout, account switch or access revocation; same-user token refresh must preserve the view.
- Deleting a chat also removes its associated feedback copies. Existing exported evaluation files are separate artifacts and require an explicit retention policy before rollout. Event drafts, events and their audit trails remain separate business records; the delete confirmation explains that deleting a chat does not delete them.

## Server lifecycle and resume behavior

1. Authenticate and authorize the user, validate the thread and request revision, and accept the turn atomically with quota reservation, question insertion and assistant placeholder creation. No model call occurs if acceptance/persistence fails. Reuse existing quota rules rather than adding a second quota system.
2. For new threads, derive the title from the accepted first question and return the canonical thread/message IDs. A retry with the same run ID returns existing run state and must not invoke the provider again.
3. Build model input from the most recent stored user questions under the existing six-question/6,000-character bounds, plus validated server-owned context. Do not trust browser-supplied assistant messages, tool results or context. Older displayed messages remain presentation only.
4. Save validated result cards and context before declaring them durable. Coalesce text/activity checkpoints, initially about once per second, and perform a final flush on completion, stop or failure. Serialize checkpoint writes with monotonic revisions so a delayed write cannot overwrite newer text or terminal status.
5. Keep the existing AG-UI stream. Use a response status such as `running`, `complete`, `stopped`, `interrupted` or `failed`, with safe error details. Emit final success only after the final persistence transaction succeeds.
6. Stop/disconnect cancels generation and performs a bounded best-effort final save using a separate persistence timeout. A terminated server process may lose the text since the last checkpoint; never promise every streamed character is durable. Reconcile expired run leases to `interrupted` on the next read, preserving the latest saved checkpoint.
7. Reopening a conversation reads persisted messages and server-owned context without a model call. Revalidate context entities and current permissions; old totals remain clearly historical snapshots. Subsequent questions retrieve current facts through existing tools.
8. Record a successfully created event draft's association with its conversation as part of the draft transaction, or another durable transactionally linked record. A failure before the final answer must not orphan a successfully created draft. Reload its current version on reopen.
9. For v1, switching chats stops the current response. Ignore late events from the old agent, keyed by thread/run identity. Persisted progress remains available when returning. If another tab has an active run, show its status and allow refresh; do not start a competing run or silently rerun it.
10. If storage fails mid-stream, show that the latest progress could not be saved, keep the visible text available to copy and reconcile by run ID. Do not silently rerun a model/tool workflow. Reject deletion of an actively leased thread until it has stopped; late checkpoints must never recreate deleted records.

Persisted verified context replaces the expiring token as the source of truth for saved chats. Existing token handling may remain temporarily for a controlled compatibility rollout, but it must not overwrite newer stored context.

## Proposed API and Angular structure

Extend the existing `/api/chat` backend:

- `GET /threads?cursor=...`: authorized, paginated title summaries.
- `GET /threads/:id/messages?before=...`: authorized transcript page, revision and current run status.
- `PATCH /threads/:id`: validated title change with revision conflict handling.
- `DELETE /threads/:id`: delete history and related feedback, subject to active-run checks.
- `POST /run`: extend the current endpoint with stable question ID and expected conversation revision; the server creates the first thread during turn acceptance.
- `POST /threads/:id/runs/:runId/stop`: idempotently record an explicit stop and cancel cooperatively. Retain transport abort as fallback; do not rely on a process-local controller being available on another serverless instance.

History reads/rename/delete should not require a working model provider or spend model quota. Decide separately whether the global chat disable switch disables inference only or all chat access; retain an emergency way to disable history access.

Keep the UI within `src/app/feature/chat/`:

- The existing chat page owns the sidebar and responsive drawer. A single optional-segment route matcher keeps the page and active agent mounted when the first saved conversation gets its URL.
- A focused history component renders summaries and emits user actions.
- A feature-local history service owns API calls, pagination and loading/mutation states.
- The existing archive chat service owns the active run and a canonical message model; add explicit activate/hydrate operations rather than reconstructing private maps in components.
- Shared frontend/backend schemas can follow the existing `core/models` convention. Server persistence and history routes belong in `src/server/chat/`.
- Match the empty chat and optional `:threadId` in the same lazy route; react to route parameter changes instead of using a one-time snapshot. Preserve `/chat?draft=...` links through an explicit compatibility path that authorizes and opens the existing draft without exposing someone else's transcript.
- Extend client rendering to `chat/**` and update viewport selectors for the shell. Keep lazy feature boundaries and the current app navigation intact.

## Required states

| State                       | User-visible behavior                                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| History loading             | Sidebar skeleton without resetting the active chat.                                                                                                  |
| No conversations            | Short explanation that chats appear after the first message; New chat remains available.                                                             |
| Transcript loading          | Skeleton in the conversation area; preserve navigation and prevent sending to the wrong thread.                                                      |
| History list error          | Inline error and Retry; retain any already loaded active conversation.                                                                               |
| Missing/unauthorized thread | Neutral unavailable message and New chat link, with no title/content disclosure.                                                                     |
| Interrupted response        | Saved partial text/results with an incomplete label; offer an explicit new attempt.                                                                  |
| Persistence failure         | Visible unsaved-progress message; retain local text and reconcile without repeating side effects.                                                    |
| Offline                     | Preserve the currently loaded view and unsent text in memory; disable network mutations with a clear retry path. No automatic queued model requests. |
| Multi-tab conflict          | Reload latest state before submitting again; preserve the user's unsent composer text.                                                               |
| Rename/delete failure       | Keep the existing title/row and show a retryable inline error.                                                                                       |
| Access revoked              | Clear sensitive rendered content and return to the existing access flow.                                                                             |

## Implementation order and acceptance checks

1. **Storage and API:** migration, ownership/permission contract, pagination, rename/delete and lifecycle transactions. Test two-user isolation, anonymous/revoked access, forged IDs, service-only writes and deletion boundaries using the existing SQL/API test setup.
2. **Durable streaming and resume:** connect the run lifecycle, stable IDs, result snapshots, context revisions, feedback and draft recovery. Test duplicate submissions, expired context, stop/timeout, process loss, out-of-order checkpoints and failure after a successful draft mutation.
3. **History UI and routing:** add the shell/sidebar/drawer, URL navigation and message hydration. Verify refresh, sign-out/sign-in, another device, Back/Forward and direct `/chat/:threadId` loads.
4. **Release checks:** test desktop/mobile, both themes, keyboard-only operation, drawer focus, 200% zoom and AXE. Re-run chat layout, draft, feedback and access regressions, architecture checks, lint, unit tests and development build.
5. **Rollout:** apply an additive migration first, deploy behind a history flag and enable for approved users after preview checks. Update `docs/chatbot-setup.md`, which currently states that transcripts are not saved. Existing lost in-memory conversations cannot be backfilled; do not reconstruct them from partial feedback/draft data.

Done means a user can send a question, refresh, find the conversation in the sidebar, reopen its saved cards/text, continue a context-dependent follow-up and recover the correct draft, while a second user cannot read any of it.

## References

- Current code: `src/app/feature/chat/data-access/archive-chat.service.ts`, `src/server/chat/router.ts`, `src/server/chat/context.ts`, `src/app/feature/chat/chat.routes.ts`, `src/app/app.routes.server.ts`.
- Project constraints: `.ui-craft/brief.md`, `.ui-craft/tokens.md`, `docs/architecture.md`.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): database policies, grants and service-role bypass behavior.
- [Angular route definitions](https://angular.dev/guide/routing/define-routes): parameterized routes for saved conversations.

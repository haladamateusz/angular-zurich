import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import { runArchiveAgent } from '../../src/server/chat/agent';
import { ArchiveContext } from '../../src/server/chat/context';
import { EventDraft, eventDraftSchema } from '../../src/app/core/models/event-draft.model';
import { draftFixture } from './draft-fixture';

// Opt-in real-model regression. All database traffic stays in this synthetic
// transport; only inference reaches OpenRouter. Four drafting turns plus one
// read-only capacity question reserve at most $0.50
// under the normal per-run caps. No production account or publishing RPC is used.
const apiKey = process.env['OPENROUTER_API_KEY'];
if (!apiKey) throw new Error('OPENROUTER_API_KEY is required for this opt-in evaluation.');

it('creates the November meetup through date, usual time, time-only and title-only turns', async () => {
  let draft: EventDraft | undefined;
  const writes: string[] = [];
  const client = createClient('https://event-planning-fixture.invalid', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const resource = url.pathname.split('/').at(-1);
        if (resource === 'can_current_user_chat' || resource === 'can_current_user_manage_events')
          return Response.json(true);
        if (resource === 'Events')
          return Response.json([
            { starts_at: '2026-09-07T16:00:00Z' },
            { starts_at: '2026-02-02T17:00:00Z' },
          ]);
        if (resource === 'Venues')
          return Response.json([
            {
              id: draftFixture.content.venueId,
              title: 'Constructor Nexademy',
              street: 'Fixture street',
              city: 'Zürich',
            },
          ]);
        // Exercise the bounded request with a full speaker catalogue.
        if (resource === 'People')
          return Response.json(
            Array.from({ length: 100 }, (_, index) => ({
              id: `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
              first_name: `Example speaker ${index}`,
              last_name: 'Synthetic',
            })),
          );
        if (resource === 'Talks') return Response.json([]);
        if (resource === 'chat_event_drafts') return Response.json(draft ?? null);
        if (resource === 'mutate_chat_event_draft') {
          const args = JSON.parse(String(init?.body));
          writes.push(args.p_action);
          if (args.p_action === 'create') {
            draft ??= eventDraftSchema.parse({
              ...draftFixture,
              version: 1,
              content: { ...args.p_data, talks: [] },
            });
          } else if (args.p_action === 'update' && draft && args.p_version === draft.version) {
            draft = eventDraftSchema.parse({
              ...draft,
              version: draft.version + 1,
              content: { ...draft.content, ...args.p_data },
            });
          } else throw new Error('Unexpected synthetic draft write');
          return Response.json(draft);
        }
        throw new Error(`Unexpected fixture operation: ${resource}`);
      },
    },
  });
  const messages: { id: string; role: 'user'; content: string }[] = [];
  const threadId = crypto.randomUUID();
  let context: ArchiveContext = { speakers: [], events: [] };
  for (const question of [
    'Can you create new event for 25th of November?',
    'As usual',
    '18:00',
    'Angular Zurich November 2026',
  ]) {
    messages.push({ id: crypto.randomUUID(), role: 'user', content: question });
    const calls: string[] = [];
    const result = await runArchiveAgent(
      { runId: crypto.randomUUID(), threadId, messages },
      client,
      apiKey!,
      AbortSignal.timeout(60000),
      (activity) => {
        if (activity.state === 'running') calls.push(activity.tool);
      },
      context,
    );
    context = result.context;
    console.info(
      JSON.stringify({
        question,
        tools: calls,
        result: result.result.kind,
        pendingEvent: context.pendingEvent,
        providerCalls: result.providerCalls,
        usage: result.usage,
      }),
    );
    expect(calls).not.toContain('list_events');
    if (messages.length === 1) {
      expect(result.result.kind).toBe('clarification');
      expect(context.pendingEvent?.date).toBe('2026-11-25');
    } else {
      expect(result.result.kind).toBe('event_draft');
      expect(draft?.content.startsAt).toBe('2026-11-25T18:00');
      expect(draft?.state).toBe('draft');
    }
  }
  expect(writes.filter((action) => action === 'create')).toHaveLength(1);
  expect(draft?.content.title).toContain('November 2026');
}, 250000);

it('answers monthly capacity without listing archive records or creating events', async () => {
  const client = createClient('https://monthly-capacity-fixture.invalid', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/rpc/can_current_user_chat')) return Response.json(true);
        if (url.pathname.endsWith('/Events') && init?.method === 'HEAD')
          return new Response(null, { headers: { 'content-range': '*/0' } });
        throw new Error('Unexpected calendar fixture operation');
      },
    },
  });
  const calls: string[] = [];
  const result = await runArchiveAgent(
    {
      runId: crypto.randomUUID(),
      threadId: crypto.randomUUID(),
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'user',
          content:
            'If we want to organize meetups once every month until the end of the year, how many could we still possibly organize?',
        },
      ],
    },
    client,
    apiKey!,
    AbortSignal.timeout(60000),
    (activity) => {
      if (activity.state === 'running') calls.push(activity.tool);
    },
    { speakers: [], events: [], eventDraftId: draftFixture.id },
  );
  expect(calls).toEqual(['plan_monthly_meetups']);
  expect(result.providerCalls).toBe(1);
  expect(result.result.kind).toBe('meetup_capacity');
  expect(result.text).toContain('Starting next month');
  if (result.result.kind === 'meetup_capacity')
    expect(result.result.additionalSlots).toBe(result.result.totalSlots);
}, 65000);

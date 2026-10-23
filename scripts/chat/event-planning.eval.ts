import { createClient } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import { runArchiveAgent } from '../../src/server/chat/agent';
import { ArchiveContext } from '../../src/server/chat/context';
import { EventDraft, eventDraftSchema } from '../../src/app/core/models/event-draft.model';
import { draftFixture } from './draft-fixture';

// Opt-in real-model regression. All database traffic stays in this synthetic
// transport; only inference reaches OpenRouter. Four drafting turns plus one
// read-only capacity question and three talk-attachment requests reserve at most $0.80
// under the normal per-run caps. No production account or publishing RPC is used.
const apiKey = process.env['OPENROUTER_API_KEY'];
if (!apiKey) throw new Error('OPENROUTER_API_KEY is required for this opt-in evaluation.');

it.each([
  { question: 'Add talk from Tomas Trajan to this event', title: 'Building agents with Angular' },
  { question: 'add the talk about agents', title: 'Building agents with Angular' },
  {
    question: 'add the talk about observables and signals',
    title: 'From Observables to Signals: Modern Angular State Management',
  },
])(
  'attaches an approved talk to the current draft: $question',
  async ({ question, title }) => {
    const talk = {
      id: '20000000-0000-4000-8000-000000000003',
      title,
      source_talk_submission_id: '20000000-0000-4000-8000-000000000004',
      speaker_links: [{ speaker: { first_name: 'Tomas', last_name: 'Trajan' } }],
    };
    const candidates = [
      ...['Introduction to Signals', 'Working with Observables'].map((title) => ({
        ...talk,
        id: crypto.randomUUID(),
        title,
        source_talk_submission_id: crypto.randomUUID(),
        speaker_links: [{ speaker: { first_name: 'Alex', last_name: 'Morgan' } }],
      })),
      talk,
    ];
    let draft = eventDraftSchema.parse({
      ...draftFixture,
      content: { ...draftFixture.content, talks: [] },
    });
    const writes: string[] = [];
    const client = createClient('https://event-planning-fixture.invalid', 'fixture-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(String(input));
          const resource = url.pathname.split('/').at(-1);
          if (resource === 'can_current_user_chat' || resource === 'can_current_user_manage_events')
            return Response.json(true);
          if (resource === 'chat_event_drafts') return Response.json(draft);
          if (resource === 'Talks') {
            const titleQuery = url.searchParams.get('title')?.replace(/^ilike\.%|%$/g, '');
            return Response.json(
              candidates.filter(
                (candidate) =>
                  !titleQuery || candidate.title.toLowerCase().includes(titleQuery.toLowerCase()),
              ),
            );
          }
          if (resource === 'organizer_talk_submissions')
            return Response.json(
              candidates.map((candidate) => ({ id: candidate.source_talk_submission_id })),
            );
          if (['People', 'Venues', 'Events'].includes(resource ?? '')) return Response.json([]);
          if (resource === 'mutate_chat_event_draft') {
            const args = JSON.parse(String(init?.body));
            expect(args.p_action).toBe('attach');
            expect(args.p_id).toBe(draft.id);
            expect(args.p_version).toBe(draft.version);
            expect(args.p_data.talkId).toBe(talk.id);
            writes.push(args.p_action);
            draft = eventDraftSchema.parse({
              ...draft,
              version: draft.version + 1,
              content: {
                ...draft.content,
                talks: [
                  {
                    id: talk.id,
                    title: talk.title,
                    description: 'A synthetic approved talk.',
                    speakerIds: ['10000000-0000-4000-8000-000000000004'],
                    sourceTalkId: talk.id,
                  },
                ],
              },
            });
            return Response.json(draft);
          }
          throw new Error(`Unexpected fixture operation: ${resource}`);
        },
      },
    });
    const calls: string[] = [];
    const result = await runArchiveAgent(
      {
        runId: crypto.randomUUID(),
        threadId: crypto.randomUUID(),
        messages: [{ id: crypto.randomUUID(), role: 'user', content: question }],
      },
      client,
      apiKey!,
      AbortSignal.timeout(60000),
      (activity) => {
        if (activity.state === 'running') calls.push(activity.tool);
      },
      { speakers: [], events: [], eventDraftId: draft.id },
    );
    console.info(JSON.stringify({ question, tools: calls, usage: result.usage }));
    expect(writes).toEqual(['attach']);
    expect(calls).toContain('get_event_options');
    expect(calls).toContain('get_event_draft');
    expect(result.result.kind).toBe('event_draft');
    expect(draft.content.talks.map((item) => item.sourceTalkId)).toEqual([talk.id]);
  },
  65000,
);

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

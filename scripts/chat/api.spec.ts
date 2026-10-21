import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { chatRouter } from '../../src/server/chat/router';
import { draftFixture } from './draft-fixture';

const USER_ID = '9b0b6d9e-527f-44a0-a128-a3565783ca2a';
const TALK_ID = '51e66cbe-f72a-457a-b7bd-ef2d42f50c3d';
const nativeFetch = globalThis.fetch;
let server: Server;
let origin: string;
let approved: boolean;
let reservation: string;
let modelCalls: number;
let quotaCalls: number;
let providerBodies: Record<string, unknown>[];
let unknownResult: boolean;
let offTopic: boolean;
let speakerQuestion: boolean;
let rankingQuestion: boolean;
let combinedQuestion: boolean;
let eventYearQuestion: boolean;
let rpcBodies: Record<string, unknown>[];
let rankingTie: boolean;
let rankingEmpty: boolean;
let holdProvider: boolean;
let holdAfterLookup: boolean;
let neverPresent: boolean;
let lookupFails: boolean;
let providerAborted: boolean;
let holdAnswer: boolean;
let failAnswer: boolean;
let truncateAnswer: boolean;
let lastTurnPresentation: boolean;
let finishAnswer: (() => void) | undefined;
let feedbackRequests: {
  url: string;
  method: string;
  body?: Record<string, unknown>;
  authorization: string | null;
}[];
let feedbackFailure: string | undefined;
let submissionAccess: boolean;
let submissionReads: number;
let submissionQuestion: boolean;
let draftQuestion: boolean;
let planningConversation: boolean;
let monthlyCapacityQuestion: boolean;
let recentStartTimes: string[];
let draftMutations: Record<string, unknown>[];
let draftPublishes: number;
let currentDraft: typeof draftFixture;
const record = {
  id: TALK_ID,
  title: 'Signals in practice',
  description: 'Angular signals and computed values.',
  event_id: USER_ID,
  event_title: 'Angular Zürich 2019',
  event_slug: '2019-meetup',
  starts_at: '2019-01-01T18:00:00Z',
  speakers: [{ id: USER_ID, name: 'Test Speaker' }],
};

function toolStream(name: string, args: unknown) {
  const id = crypto.randomUUID();
  const chunks = [
    {
      id,
      object: 'chat.completion.chunk',
      created: 1,
      model: 'openai/gpt-5.6-luna',
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    {
      id,
      object: 'chat.completion.chunk',
      created: 1,
      model: 'openai/gpt-5.6-luna',
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    },
  ];
  return new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

function answerStream(signal?: AbortSignal | null) {
  const id = crypto.randomUUID();
  const encode = (delta: object, finish_reason: string | null = null) =>
    new TextEncoder().encode(
      `data: ${JSON.stringify({
        id,
        object: 'chat.completion.chunk',
        created: 1,
        model: 'openai/gpt-5.6-luna',
        choices: [{ index: 0, delta, finish_reason }],
        ...(finish_reason
          ? { usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }
          : {}),
      })}\n\n`,
    );
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encode({ role: 'assistant', content: 'Test Speaker gave ' }));
        const abort = () => {
          providerAborted = true;
          controller.error(new Error('cancelled'));
        };
        signal?.addEventListener('abort', abort, { once: true });
        finishAnswer = () => {
          signal?.removeEventListener('abort', abort);
          if (failAnswer) {
            controller.error(new Error('provider disconnected'));
            return;
          }
          controller.enqueue(encode({ content: 'a talk about Angular signals.' }));
          controller.enqueue(encode({}, truncateAnswer ? 'length' : 'stop'));
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        };
        if (!holdAnswer) finishAnswer();
      },
      cancel() {
        providerAborted = true;
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

beforeAll(async () => {
  const app = express();
  app.use('/api/chat', chatRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing test address');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  approved = true;
  reservation = 'ok';
  modelCalls = 0;
  quotaCalls = 0;
  providerBodies = [];
  unknownResult = false;
  offTopic = false;
  speakerQuestion = false;
  rankingQuestion = false;
  combinedQuestion = false;
  eventYearQuestion = false;
  rpcBodies = [];
  rankingTie = false;
  rankingEmpty = false;
  holdProvider = false;
  holdAfterLookup = false;
  neverPresent = false;
  lookupFails = false;
  providerAborted = false;
  holdAnswer = false;
  failAnswer = false;
  truncateAnswer = false;
  lastTurnPresentation = false;
  finishAnswer = undefined;
  feedbackRequests = [];
  feedbackFailure = undefined;
  submissionAccess = true;
  submissionReads = 0;
  submissionQuestion = false;
  draftQuestion = false;
  planningConversation = false;
  monthlyCapacityQuestion = false;
  recentStartTimes = [];
  draftMutations = [];
  draftPublishes = 0;
  currentDraft = structuredClone(draftFixture);
  vi.stubEnv('SUPABASE_URL', 'https://supabase.test.invalid');
  vi.stubEnv('SUPABASE_KEY', 'test-public');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
  vi.stubEnv('OPENROUTER_API_KEY', 'test-router');
  vi.stubEnv('CHAT_ENABLED', 'true');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('supabase.test.invalid')) {
        if (target.includes('/auth/v1/user'))
          return Response.json({
            id: USER_ID,
            email: 'test@gmail.com',
            app_metadata: {},
            user_metadata: {},
            aud: 'authenticated',
            created_at: '2026-01-01',
          });
        if (target.includes('/can_current_user_chat')) return Response.json(approved);
        if (target.includes('/rest/v1/Events')) {
          const params = new URL(target).searchParams;
          expect(params.get('public')).toBe('eq.true');
          if (params.get('select') === 'id' && init?.method === 'HEAD')
            return new Response(null, { headers: { 'content-range': '*/0' } });
          if (params.get('select') === 'starts_at')
            return Response.json(recentStartTimes.map((starts_at) => ({ starts_at })));
          expect(params.get('title')).toBeNull();
          expect(params.getAll('starts_at')).toEqual([
            'gte.2021-01-01T00:00:00+01:00',
            'lt.2022-01-01T00:00:00+01:00',
          ]);
          return Response.json([
            {
              id: USER_ID,
              title: 'Angular meetup 2021',
              slug: 'meetup-2021',
              starts_at: '2021-06-10T17:00:00Z',
            },
          ]);
        }
        if (target.includes('/rest/v1/chat_event_drafts')) return Response.json([currentDraft]);
        if (target.includes('/rest/v1/chat_event_draft_audit')) return Response.json([]);
        if (target.includes('/mutate_chat_event_draft')) {
          const args = JSON.parse(String(init?.body));
          draftMutations.push(args);
          if (planningConversation) {
            const fields = args.p_data;
            currentDraft = {
              ...currentDraft,
              version: args.p_action === 'create' ? 1 : currentDraft.version + 1,
              content: {
                ...currentDraft.content,
                ...Object.fromEntries(
                  Object.entries(fields).filter(([key]) =>
                    [
                      'title',
                      'description',
                      'startsAt',
                      'venueId',
                      'meetupUrl',
                      'imageUrl',
                    ].includes(key),
                  ),
                ),
                talks: [],
              },
            };
          }
          return Response.json(currentDraft);
        }
        if (target.includes('/rest/v1/Venues')) return Response.json([]);
        if (target.includes('/rest/v1/People')) return Response.json([]);
        if (target.includes('/rest/v1/Talks')) return Response.json([]);
        if (target.includes('/publish_chat_event_draft')) {
          expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-service');
          const args = JSON.parse(String(init?.body));
          expect(args.p_actor).toBe(USER_ID);
          if (args.p_version !== currentDraft.version)
            return Response.json({ code: '40001' }, { status: 409 });
          draftPublishes++;
          currentDraft = {
            ...currentDraft,
            state: 'published',
            version: currentDraft.version + 1,
            event_id: TALK_ID,
            event_slug: 'agentic-angular',
          };
          return Response.json(currentDraft);
        }
        if (target.includes('/can_current_user_manage_events'))
          return Response.json(submissionAccess);
        if (target.includes('/rest/v1/organizer_talk_submissions')) {
          submissionReads++;
          expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-token');
          return Response.json([
            {
              id: TALK_ID,
              created_at: '2026-10-15T00:00:00Z',
              status: 'initially_submitted',
              talk_title: 'Proposal about signals',
              speaker_name: 'Test Speaker',
              speaker_label: null,
            },
          ]);
        }
        if (target.includes('/rest/v1/chat_feedback')) {
          feedbackRequests.push({
            url: target,
            method: init?.method ?? 'GET',
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
            authorization: new Headers(init?.headers).get('Authorization'),
          });
          return feedbackFailure
            ? Response.json(
                { code: feedbackFailure, message: 'Private database error' },
                { status: 403 },
              )
            : new Response(null, { status: 204 });
        }
        if (target.includes('/reserve_chat_run')) {
          quotaCalls++;
          return Response.json(reservation);
        }
        if (target.includes('/finish_chat_run')) return Response.json(null);
        if (target.includes('/query_chat_archive')) {
          rpcBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return Response.json({
            items: [record],
            total: 1,
            past: 1,
            upcoming: 0,
            years: [{ year: 2019, past: 1, upcoming: 0 }],
            totalSpeakers: 1,
            hasMore: false,
            nextOffset: 10,
          });
        }
        if (target.includes('/rank_chat_speakers')) {
          if (lookupFails) return Response.json({ message: 'denied' }, { status: 403 });
          return Response.json({
            items: rankingEmpty
              ? []
              : [
                  { id: USER_ID, name: 'Tomas Trajan', talkCount: 14, rank: 1 },
                  {
                    id: TALK_ID,
                    name: 'Other Speaker',
                    talkCount: rankingTie ? 14 : 5,
                    rank: rankingTie ? 1 : 2,
                  },
                ],
            totalSpeakers: rankingEmpty ? 0 : 25,
            highestCount: rankingEmpty ? 0 : 14,
            leaderCount: rankingEmpty ? 0 : rankingTie ? 2 : 1,
            hasMore: !rankingEmpty,
            nextOffset: 10,
          });
        }
        if (target.includes('/get_chat_speaker_archive'))
          return Response.json({
            speakers: [{ id: USER_ID, name: 'Tomas Trajan' }],
            ambiguous: false,
            stats: {
              total: 14,
              past: 13,
              upcoming: 1,
              years: [
                { year: 2019, past: 13, upcoming: 0 },
                { year: 2027, past: 0, upcoming: 1 },
              ],
            },
            page: { items: [record], hasMore: true, nextOffset: 10 },
          });
        if (target.includes('/search_chat_talks') && lookupFails)
          return Response.json({ code: '42501', message: 'denied' }, { status: 403 });
        if (target.includes('/search_chat_talks'))
          return Response.json({ items: [record], hasMore: false, nextOffset: 10 });
        throw new Error(`Unexpected database call ${target}`);
      }
      if (target.startsWith('https://openrouter.ai/api/v1/')) {
        modelCalls++;
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        providerBodies.push(body);
        if (!providerBodies.at(-1)?.['tools']) return answerStream(init?.signal);
        if (holdProvider || (holdAfterLookup && modelCalls === 2))
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => {
                providerAborted = true;
                reject(new Error('cancelled'));
              },
              { once: true },
            );
          });
        if (monthlyCapacityQuestion) return toolStream('plan_monthly_meetups', {});
        if (eventYearQuestion)
          return modelCalls === 1
            ? toolStream('list_events', { query: '', fromYear: 2021, toYear: 2021, offset: 0 })
            : toolStream('present_results', { status: 'results', ids: [USER_ID] });
        if (combinedQuestion)
          return toolStream('query_archive', {
            query: 'signals',
            speakerId: USER_ID,
            fromYear: 2019,
            toYear: 2023,
            mode: 'stats',
            period: 'past',
            offset: 0,
          });
        if (planningConversation) {
          const messages = body['messages'] as { role: string; content: string }[];
          const latest = messages.filter((message) => message.role === 'user').at(-1)!.content;
          const contextMatch = String(
            messages.find((message) => message.role === 'system')?.content,
          ).match(/"date":"(\d{4}-\d{2}-\d{2})"/);
          if (latest.includes('25th'))
            return toolStream('clarify', {
              reason: 'schedule',
              eventDate: '2026-11-25',
              eventTime: null,
              eventTitle: null,
            });
          if (latest === 'As usual') {
            if (messages.some((message) => message.role === 'tool'))
              return toolStream('clarify', {
                reason: 'schedule',
                eventDate: contextMatch?.[1],
                eventTime: null,
                eventTitle: null,
              });
            return toolStream('get_event_options', { query: '' });
          }
          if (latest === '18:00') {
            if (messages.some((message) => message.role === 'tool'))
              return toolStream('publish_event', { draftId: currentDraft.id });
            return toolStream('create_event_draft', {
              title: 'Angular Zürich November 2026',
              startsAt: contextMatch?.[1] + 'T18:00',
              description: null,
              venueId: null,
              meetupUrl: null,
              imageUrl: null,
            });
          }
          if (latest === 'Angular Zurich November 2026') {
            const completed = messages.filter((message) => message.role === 'tool').length;
            if (completed === 0) return toolStream('get_event_draft', { draftId: currentDraft.id });
            if (completed === 1)
              return toolStream('update_event', {
                draftId: currentDraft.id,
                expectedVersion: currentDraft.version,
                fields: { title: latest },
              });
            return toolStream('publish_event', { draftId: currentDraft.id });
          }
        }
        if (draftQuestion)
          return modelCalls === 1
            ? toolStream('create_event_draft', draftFixture.content)
            : toolStream('publish_event', { draftId: draftFixture.id });
        if (submissionQuestion)
          return toolStream('list_talk_submissions', {
            title: '',
            speaker: '',
            status: 'awaiting_review',
            offset: 0,
            limit: 10,
          });
        if (lastTurnPresentation && modelCalls < 3)
          return toolStream('search_talks', { query: 'signals', offset: 0 });
        if (neverPresent) return toolStream('search_talks', { query: 'signals', offset: 0 });
        if (rankingQuestion)
          return modelCalls === 1
            ? toolStream('rank_speakers', { offset: 0 })
            : toolStream('present_results', { status: 'results', ids: [] });
        if (offTopic) return toolStream('present_results', { status: 'off_topic', ids: [] });
        return modelCalls === 1
          ? speakerQuestion
            ? toolStream('get_speaker_stats', { name: 'Tomas Trajan', offset: 0 })
            : toolStream('search_talks', { query: 'signals', offset: 0 })
          : toolStream('present_results', {
              status: 'results',
              ids: [unknownResult ? USER_ID : TALK_ID],
            });
      }
      throw new Error(`Unexpected outbound fetch ${target}`);
    }),
  );
});

function post(
  path = '/run',
  body: unknown = {
    runId: crypto.randomUUID(),
    threadId: crypto.randomUUID(),
    messages: [{ role: 'user', content: 'Who gave a talk about signals?' }],
  },
  authenticated = true,
) {
  return nativeFetch(`${origin}/api/chat${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: 'Bearer test-token' } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('protected chat API', () => {
  it('answers remaining monthly meetup capacity without selecting archive IDs or writing drafts', async () => {
    monthlyCapacityQuestion = true;
    const response = await post('/run', {
      runId: crypto.randomUUID(),
      threadId: crypto.randomUUID(),
      messages: [
        {
          role: 'user',
          content:
            'If we want to organize meetups once every month until the end of the year, how many could we still possibly organize?',
        },
      ],
    });
    const events = await response.text();
    expect(events).toContain('RUN_FINISHED');
    expect(events).not.toContain('RUN_ERROR');
    expect(events).toContain('"kind":"meetup_capacity"');
    expect(events).toContain('Starting next month');
    expect(events).toContain('No published events are recorded');
    expect(modelCalls).toBe(1);
    expect(draftMutations).toHaveLength(0);
    expect(draftPublishes).toBe(0);
  });
  it('keeps the requested event date across clarification, usual-time lookup and a time-only reply', async () => {
    planningConversation = true;
    const threadId = crypto.randomUUID();
    let contextToken: string | undefined;
    async function turn(content: string) {
      const response = await post('/run', {
        runId: crypto.randomUUID(),
        threadId,
        contextToken,
        messages: [{ role: 'user', content }],
      });
      const raw = await response.text();
      expect(raw).not.toContain('RUN_ERROR');
      const events = raw
        .split('\n')
        .filter((line) => line.startsWith('data: '))
        .map((line) => JSON.parse(line.slice(6)));
      contextToken = events.find((event) => event.type === 'STATE_SNAPSHOT').snapshot.contextToken;
      return raw;
    }
    expect(await turn('Can you create new event for 25th of November?')).toContain(
      'What time should the meetup on 2026-11-25 start',
    );
    expect(await turn('As usual')).toContain('What time should the meetup on 2026-11-25 start');
    expect(await turn('18:00')).toContain('"kind":"event_draft"');
    expect(draftMutations).toHaveLength(1);
    expect(draftMutations[0]['p_data']).toMatchObject({
      startsAt: '2026-11-25T18:00',
      venueId: '',
      meetupUrl: '',
      imageUrl: '',
    });
    expect(draftPublishes).toBe(0);
    expect(await turn('Angular Zurich November 2026')).toContain('"kind":"event_draft"');
    expect(draftMutations).toHaveLength(2);
    expect(draftMutations[1]).toMatchObject({
      p_action: 'update',
      p_version: 1,
      p_data: { title: 'Angular Zurich November 2026' },
    });
    expect(currentDraft.content.startsAt).toBe('2026-11-25T18:00');
    expect(
      (providerBodies.at(-1)?.['tools'] as { function: { name: string } }[]).map(
        (tool) => tool.function.name,
      ),
    ).not.toContain('create_event_draft');
    const optionsFollowup = providerBodies.find((body) =>
      (body['messages'] as { role: string }[]).some((message) => message.role === 'tool'),
    );
    expect(
      (optionsFollowup?.['tools'] as { function: { name: string } }[]).map(
        (tool) => tool.function.name,
      ),
    ).toContain('clarify');
  });
  it('streams sources for events from 2021 using date filters and accepts their IDs', async () => {
    eventYearQuestion = true;
    const response = await post('/run', {
      runId: crypto.randomUUID(),
      threadId: crypto.randomUUID(),
      messages: [{ role: 'user', content: 'give me events from 2021' }],
    });
    const events = await response.text();
    expect(events).toContain('Angular meetup 2021');
    expect(events).toContain('/events/meetup-2021');
    expect(events).toContain('RUN_FINISHED');
    expect(events).not.toContain('RUN_ERROR');
  });
  it('prepares a draft in chat without publishing even when the model requests publication', async () => {
    draftQuestion = true;
    const events = await (await post('/run')).text();
    expect(events).toContain('"kind":"event_draft"');
    expect(events).toContain('confirmation');
    expect(events).toContain('RUN_FINISHED');
    expect(draftPublishes).toBe(0);
    expect(modelCalls).toBe(2);
  });
  it('requires an explicit, valid UI approval and rejects stale or denied publication', async () => {
    const path = `/drafts/${draftFixture.id}`;
    expect(
      (await post(`${path}/publish`, { expectedVersion: 3, confirmed: true, token: 'yes' })).status,
    ).toBe(409);
    const review = await (await post(`${path}/review`, { expectedVersion: 3 })).json();
    expect(review.token).toBeTruthy();
    expect(
      (await post(`${path}/publish`, { expectedVersion: 3, token: review.token })).status,
    ).toBe(400);
    submissionAccess = false;
    expect(
      (await post(`${path}/publish`, { expectedVersion: 3, token: review.token, confirmed: true }))
        .status,
    ).toBe(403);
    submissionAccess = true;
    currentDraft.version = 4;
    expect(
      (await post(`${path}/publish`, { expectedVersion: 3, token: review.token, confirmed: true }))
        .status,
    ).toBe(409);
    expect(draftPublishes).toBe(0);
    const fresh = await (await post(`${path}/review`, { expectedVersion: 4 })).json();
    expect(
      (await post(`${path}/publish`, { expectedVersion: 4, token: fresh.token, confirmed: true }))
        .status,
    ).toBe(200);
    expect(draftPublishes).toBe(1);
  });
  it('answers a pending-submissions question using organizer data and emits review cards', async () => {
    submissionQuestion = true;
    const response = await post('/run', {
      runId: crypto.randomUUID(),
      threadId: crypto.randomUUID(),
      messages: [{ role: 'user', content: 'Do we have any talk submissions awaiting review?' }],
    });
    const events = await response.text();
    expect(response.status).toBe(200);
    expect(events).toContain('"kind":"submissions"');
    expect(events).toContain('Proposal about signals');
    expect(events).toContain('awaiting organizer review');
    expect(events).toContain('list_talk_submissions');
    expect(events).toContain('RUN_FINISHED');
    expect(events).not.toContain('RUN_ERROR');
    expect(submissionReads).toBe(1);
    expect(modelCalls).toBe(1);
  });
  it('does not misreport denied submission access as an empty review queue', async () => {
    submissionQuestion = true;
    submissionAccess = false;
    const events = await (await post('/run')).text();
    expect(events).toContain('RUN_ERROR');
    expect(events).not.toContain('No matching talk submissions');
    expect(events).not.toContain('archive_sources');
    expect(submissionReads).toBe(0);
  });
  const feedback = {
    threadId: 'd3034c48-a641-4e69-aa28-a3e73f2b74fd',
    messageId: '8b67d7df-d8e8-40ed-b0ab-051fb92d1559',
    question: 'Which talks cover signals?',
    answer: 'Signals in practice covers this topic.',
    sourceIds: [TALK_ID],
    result: { kind: 'talks', total: 1 },
    rating: 'useful',
  };

  it('saves and changes feedback with the caller identity without spending model quota', async () => {
    vi.stubEnv('CHAT_ENABLED', 'false');
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    for (const rating of ['useful', 'not_quite']) {
      const response = await post('/feedback', { ...feedback, rating });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ rating });
    }
    expect(feedbackRequests).toHaveLength(2);
    expect(feedbackRequests[1].body).toMatchObject({
      user_id: USER_ID,
      message_id: feedback.messageId,
      thread_id: feedback.threadId,
      rating: 'not_quite',
      question: feedback.question,
      answer: feedback.answer,
      source_ids: [TALK_ID],
      result: feedback.result,
    });
    expect(new URL(feedbackRequests[1].url).searchParams.get('on_conflict')).toBe(
      'user_id,message_id',
    );
    expect(feedbackRequests[1].authorization).toBe('Bearer test-token');
    expect(modelCalls).toBe(0);
    expect(quotaCalls).toBe(0);
  });

  it('removes only the caller’s vote for the specified answer', async () => {
    expect((await post('/feedback', { ...feedback, rating: null })).status).toBe(200);
    const request = feedbackRequests[0];
    expect(request.method).toBe('DELETE');
    const params = new URL(request.url).searchParams;
    expect(params.get('user_id')).toBe(`eq.${USER_ID}`);
    expect(params.get('message_id')).toBe(`eq.${feedback.messageId}`);
  });

  it('rejects anonymous and unapproved feedback before database writes', async () => {
    expect((await post('/feedback', feedback, false)).status).toBe(401);
    approved = false;
    expect((await post('/feedback', feedback)).status).toBe(403);
    expect(feedbackRequests).toHaveLength(0);
  });

  it.each([
    { rating: 'invalid' },
    { messageId: 'not-an-id' },
    { user_id: USER_ID },
    { question: 'x'.repeat(2001) },
    { answer: '' },
    { sourceIds: ['invalid'] },
  ])('rejects malformed feedback: %j', async (change) => {
    expect((await post('/feedback', { ...feedback, ...change })).status).toBe(400);
    expect(feedbackRequests).toHaveLength(0);
  });

  it.each([
    ['42501', 403],
    ['42P01', 503],
  ] as const)(
    'reports feedback database failure %s without leaking details',
    async (code, status) => {
      feedbackFailure = code;
      const response = await post('/feedback', feedback);
      expect(response.status).toBe(status);
      expect(await response.text()).not.toContain('Private database error');
    },
  );

  it('streams tool activity before waiting for the next model response', async () => {
    holdAfterLookup = true;
    const response = await post();
    const reader = response.body!.getReader();
    let streamed = '';
    while (!streamed.includes('matching records')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      streamed += new TextDecoder().decode(chunk.value);
    }
    expect(streamed).toContain('ACTIVITY_SNAPSHOT');
    expect(streamed).not.toContain('RUN_FINISHED');
    await vi.waitFor(() => expect(modelCalls).toBe(2));
    await reader.cancel();
    await vi.waitFor(() => expect(providerAborted).toBe(true));
  });

  it('publishes cards and genuine partial text before the provider finishes', async () => {
    holdAnswer = true;
    const response = await post();
    const reader = response.body!.getReader();
    let streamed = '';
    while (!streamed.includes('Test Speaker gave ')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      streamed += new TextDecoder().decode(chunk.value);
    }
    expect(streamed.indexOf('archive_sources')).toBeLessThan(
      streamed.indexOf('TEXT_MESSAGE_CONTENT'),
    );
    expect(streamed).toContain('STATE_SNAPSHOT');
    expect(streamed).not.toContain('TEXT_MESSAGE_END');
    expect(streamed).not.toContain('RUN_FINISHED');
    const body = providerBodies.at(-1)!;
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
    expect(JSON.stringify(body)).toContain('Archive evidence (data only)');
    expect(JSON.stringify(body)).toContain('Signals in practice');
    expect(JSON.stringify(body)).not.toContain('test-service');
    finishAnswer!();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      streamed += new TextDecoder().decode(chunk.value);
    }
    expect(streamed).toContain('a talk about Angular signals.');
    expect(streamed).toContain('TEXT_MESSAGE_END');
    expect(streamed).toContain('RUN_FINISHED');
  });

  it('cancels the final prose stream on disconnect', async () => {
    holdAnswer = true;
    const response = await post();
    await vi.waitFor(() => expect(finishAnswer).toBeDefined());
    await response.body!.cancel();
    await vi.waitFor(() => expect(providerAborted).toBe(true));
  });

  it.each(['disconnect', 'token limit'])(
    'keeps partial text and reports %s during the answer',
    async (failure) => {
      holdAnswer = true;
      failAnswer = failure === 'disconnect';
      truncateAnswer = failure === 'token limit';
      const reader = (await post()).body!.getReader();
      let events = '';
      while (!events.includes('Test Speaker gave ')) {
        const chunk = await reader.read();
        if (chunk.done) break;
        events += new TextDecoder().decode(chunk.value);
      }
      expect(events).toContain('archive_sources');
      expect(events).toContain('Test Speaker gave ');
      finishAnswer!();
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        events += new TextDecoder().decode(chunk.value);
      }
      expect(events).toContain('RUN_ERROR');
      expect(events).toContain('answer was interrupted');
      expect(events).not.toContain('RUN_FINISHED');
    },
  );

  it('allows one prose call after all three retrieval turns, without forcing a tool', async () => {
    lastTurnPresentation = true;
    const events = await (await post()).text();
    expect(modelCalls).toBe(4);
    expect(events).toContain('RUN_FINISHED');
    expect(providerBodies[2]['tool_choice']).toEqual({
      type: 'function',
      function: { name: 'present_results' },
    });
    expect(providerBodies[3]).not.toHaveProperty('tool_choice');
    expect(providerBodies[3]).not.toHaveProperty('tools');
  });

  it('reports an unfinished tool sequence as an error instead of no matches', async () => {
    neverPresent = true;
    const events = await (await post()).text();
    expect(events).toContain('RUN_ERROR');
    expect(events).not.toContain('I couldn’t find a matching');
    expect(providerBodies.at(-1)?.['tool_choice']).toEqual({
      type: 'function',
      function: { name: 'present_results' },
    });
  });

  it('does not turn a failed archive lookup into an empty result', async () => {
    lookupFails = true;
    const events = await (await post()).text();
    expect(events).toContain('RUN_ERROR');
    expect(events).toContain('"state":"failed"');
    expect(events).not.toContain('I couldn’t find a matching');
  });

  it('returns exact speaker totals and year counts with source records', async () => {
    speakerQuestion = true;
    const response = await post();
    const events = await response.text();
    expect(events).toContain('Tomas Trajan has 13 talks');
    expect(events).toContain('2019: 13 past');
    expect(events).toContain('of 14 published talks');
    expect(events).not.toContain('nextQuestion');
    expect(events).toContain('get_speaker_stats');
    expect(modelCalls).toBe(2);
    expect(events).toContain('RUN_FINISHED');
  });

  it('combines speaker, topic, date and period filters, returning typed statistics in one call', async () => {
    combinedQuestion = true;
    const events = await (await post()).text();
    expect(events).toContain('RUN_FINISHED');
    expect(events).toContain('"kind":"stats"');
    expect(rpcBodies[0]).toMatchObject({
      p_query: 'signals',
      p_speaker_id: USER_ID,
      p_from_year: 2019,
      p_to_year: 2023,
      p_period: 'past',
      p_mode: 'stats',
    });
    expect(modelCalls).toBe(2);
  });

  it('carries server-verified context into the next turn and rejects a forged token before reserving credit', async () => {
    const threadId = crypto.randomUUID();
    const request = (contextToken?: string) => ({
      runId: crypto.randomUUID(),
      threadId,
      contextToken,
      messages: [{ role: 'user', content: 'Who spoke about signals?' }],
    });
    const stream = await (await post('/run', request())).text();
    const events = stream
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)));
    const token = events.find((event) => event.type === 'STATE_SNAPSHOT').snapshot.contextToken;
    expect(typeof token).toBe('string');
    const count = modelCalls;
    const response = await post('/run', request(token));
    await response.text();
    expect(JSON.stringify(providerBodies[count])).toContain('Test Speaker');
    const reservations = quotaCalls;
    expect((await post('/run', request('forged-token'))).status).toBe(400);
    expect(quotaCalls).toBe(reservations);
  });

  it('declines off-topic questions without displaying model-written prose', async () => {
    offTopic = true;
    const response = await post();
    expect(await response.text()).toContain(
      'I can help with Angular Zürich talks, speakers, and events',
    );
  });

  it('does not publish source IDs that were never retrieved', async () => {
    unknownResult = true;
    const response = await post();
    const body = await response.text();
    expect(body).not.toContain('/events/2019-meetup');
    expect(body).not.toContain('Test Speaker');
  });

  it('aborts the upstream model when the browser disconnects', async () => {
    holdProvider = true;
    const response = await post();
    await vi.waitFor(() => expect(modelCalls).toBe(1));
    await response.body?.cancel();
    await vi.waitFor(() => expect(providerAborted).toBe(true));
  });

  it('rejects invalid input before reserving credit', async () => {
    expect(
      (
        await post('/run', {
          runId: crypto.randomUUID(),
          threadId: crypto.randomUUID(),
          messages: [{ role: 'user', content: 'x'.repeat(2001) }],
        })
      ).status,
    ).toBe(400);
    expect(quotaCalls).toBe(0);
    expect(modelCalls).toBe(0);
  });
  it('answers most-talks questions with database totals instead of counting a speaker page', async () => {
    rankingQuestion = true;
    const events = await (
      await post('/run', {
        runId: crypto.randomUUID(),
        threadId: crypto.randomUUID(),
        messages: [{ role: 'user', content: 'Who gave the most talks?' }],
      })
    ).text();
    expect(events).toContain('RUN_FINISHED');
    expect(events).not.toContain('RUN_ERROR');
    expect(events).toContain('Tomas Trajan has given the most talks');
    expect(events).toContain('archive: 14');
    expect(events).toContain('rank_speakers');
    expect(events).toContain('exclude upcoming events');
    expect(events).not.toContain('nextQuestion');
    expect(modelCalls).toBeLessThanOrEqual(3);
  }, 15000);

  it('reports ties instead of inventing a single winner', async () => {
    rankingQuestion = true;
    rankingTie = true;
    const events = await (await post()).text();
    expect(events).toContain('2 speakers are tied');
    expect(events).toContain('with 14 each');
    expect(events).toContain('Tomas Trajan');
    expect(events).toContain('Other Speaker');
    expect(events).toContain('RUN_FINISHED');
  });

  it('handles an empty ranking without inventing a winner', async () => {
    rankingQuestion = true;
    rankingEmpty = true;
    const events = await (await post()).text();
    expect(events).toContain('No speakers with talks at past published');
    expect(events).toContain('RUN_FINISHED');
    expect(events).not.toContain('Tomas Trajan');
  });

  it('fails closed when the ranking lookup fails', async () => {
    rankingQuestion = true;
    lookupFails = true;
    const events = await (await post()).text();
    expect(events).toContain('RUN_ERROR');
    expect(events).not.toContain('RUN_FINISHED');
    expect(events).not.toContain('Tomas Trajan');
  });

  it('rejects anonymous and revoked users before reserving credit or calling a model', async () => {
    expect((await post('/run', {}, false)).status).toBe(401);
    approved = false;
    expect((await post()).status).toBe(403);
    expect(modelCalls).toBe(0);
    expect(quotaCalls).toBe(0);
  });
  it('checks access without reserving credit or calling a model', async () => {
    const response = await nativeFetch(`${origin}/api/chat/access`, {
      headers: { Authorization: 'Bearer test-token' },
    });
    expect(await response.json()).toEqual({ approved: true, available: true });
    expect(modelCalls).toBe(0);
    expect(quotaCalls).toBe(0);
  });
  it('enforces the server quota before starting the model', async () => {
    reservation = 'budget_limit';
    expect((await post()).status).toBe(429);
    expect(modelCalls).toBe(0);
  });
  it('fails closed when disabled or the reservation cannot be obtained', async () => {
    vi.stubEnv('CHAT_ENABLED', 'false');
    expect((await post()).status).toBe(503);
    expect(modelCalls).toBe(0);
  });
  it('runs real server tools and only returns source-linked database records', async () => {
    const response = await post();
    const events = await response.text();
    expect(response.status).toBe(200);
    expect(events).toContain('RUN_FINISHED');
    expect(events).toContain('ACTIVITY_SNAPSHOT');
    expect(events).toContain('matching records');
    expect(events.indexOf('ACTIVITY_SNAPSHOT')).toBeLessThan(events.indexOf('archive_sources'));
    expect(events).toContain('Signals in practice');
    expect(events).toContain('Test Speaker');
    expect(events).toContain('/events/2019-meetup');
    expect(events).not.toContain('test-service');
    expect(modelCalls).toBeLessThanOrEqual(3);
    expect(modelCalls).toBeGreaterThan(0);
    for (const body of providerBodies) {
      expect(body['model']).toBe('openai/gpt-5.6-luna');
      expect(body['max_tokens']).toBe(800);
      expect(body).not.toHaveProperty('parallel_tool_calls');
      expect(body['provider']).toMatchObject({ max_price: { prompt: 0.2, completion: 1.2 } });
    }
  }, 15000);
  it('rejects requests to runtime endpoints that could bypass the run gate', async () => {
    expect((await post('/agent/default/run')).status).toBe(404);
    expect((await post('/suggestions')).status).toBe(404);
    expect((await post('/transcribe')).status).toBe(404);
    expect(modelCalls).toBe(0);
  });
  it('exposes archive and private-draft MCP tools behind the same approval check', async () => {
    const response = await nativeFetch(`${origin}/api/chat/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'search_talks',
      'find_speakers',
      'list_events',
      'plan_monthly_meetups',
      'get_talks_by_speaker',
      'get_talks_by_event',
      'get_talk',
      'get_speaker_talks',
      'get_speaker_stats',
      'rank_speakers',
      'query_archive',
      'list_talk_submissions',
      'get_talk_submission',
      'get_event_options',
      'create_event_draft',
      'get_event_draft',
      'update_event',
      'create_talk_draft',
      'attach_talk_to_event',
      'publish_event',
      'discard_event_draft',
    ]);
    expect(modelCalls).toBe(0);
  });
  it('only returns a review link when an MCP client calls publish_event', async () => {
    const response = await nativeFetch(`${origin}/api/chat/mcp`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'publish_event', arguments: { draftId: draftFixture.id } },
      }),
    });
    const body = await response.json();
    expect(body.result.isError).not.toBe(true);
    const result = JSON.parse(body.result.content[0].text);
    expect(result.requiresApproval).toBe(true);
    expect(result.reviewUrl).toBe(`/chat?draft=${draftFixture.id}`);
    expect(result).not.toHaveProperty('token');
    expect(draftPublishes).toBe(0);
    expect(modelCalls).toBe(0);
  });
  it('reads submissions over MCP using the organizer session without model calls', async () => {
    const response = await callSubmissionMcp({});
    const body = await response.json();
    expect(body.result.isError).not.toBe(true);
    expect(JSON.parse(body.result.content[0].text).items[0].talk_title).toBe(
      'Proposal about signals',
    );
    expect(submissionReads).toBe(1);
    expect(modelCalls).toBe(0);
    expect(quotaCalls).toBe(0);
  });
  it('denies submission reads to chat users without organizer permission', async () => {
    submissionAccess = false;
    const body = await (await callSubmissionMcp({})).json();
    expect(body.result.isError).toBe(true);
    expect(submissionReads).toBe(0);
    approved = false;
    expect((await callSubmissionMcp({})).status).toBe(403);
  });
  it('rejects invalid MCP submission arguments before database access', async () => {
    const body = await (await callSubmissionMcp({ limit: 1000 })).json();
    expect(Boolean(body.error || body.result?.isError)).toBe(true);
    expect(submissionReads).toBe(0);
  });
});

function callSubmissionMcp(args: Record<string, unknown>) {
  return nativeFetch(`${origin}/api/chat/mcp`, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'list_talk_submissions', arguments: args },
    }),
  });
}

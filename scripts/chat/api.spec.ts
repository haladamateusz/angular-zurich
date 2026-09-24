import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { chatRouter } from '../../src/server/chat/router';

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
let rpcBodies: Record<string, unknown>[];
let rankingTie: boolean;
let rankingEmpty: boolean;
let holdProvider: boolean;
let holdAfterLookup: boolean;
let neverPresent: boolean;
let lookupFails: boolean;
let providerAborted: boolean;
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
  rpcBodies = [];
  rankingTie = false;
  rankingEmpty = false;
  holdProvider = false;
  holdAfterLookup = false;
  neverPresent = false;
  lookupFails = false;
  providerAborted = false;
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
        providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
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

  it('returns exact speaker totals and year counts with source records and a next-page prompt', async () => {
    speakerQuestion = true;
    const response = await post();
    const events = await response.text();
    expect(events).toContain('Tomas Trajan has 13 talks');
    expect(events).toContain('2019: 13 past');
    expect(events).toContain('of 14 published talks');
    expect(events).toContain('starting at offset 10');
    expect(events).toContain('get_speaker_stats');
    expect(modelCalls).toBe(1);
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
    expect(modelCalls).toBe(1);
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
    expect(events).toContain('offset 10');
    expect(modelCalls).toBeLessThanOrEqual(2);
  }, 15000);

  it('reports ties instead of inventing a single winner', async () => {
    rankingQuestion = true;
    rankingTie = true;
    const events = await (await post()).text();
    expect(events).toContain('2 speakers are tied');
    expect(events).toContain('with 14 each');
    expect(events).toContain('1. Tomas Trajan');
    expect(events).toContain('1. Other Speaker');
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
    expect(modelCalls).toBeLessThanOrEqual(2);
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
  it('exposes read-only MCP tools behind the same approval check', async () => {
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
      'get_talks_by_speaker',
      'get_talks_by_event',
      'get_talk',
      'get_speaker_talks',
      'get_speaker_stats',
      'rank_speakers',
      'query_archive',
    ]);
    expect(modelCalls).toBe(0);
  });
});

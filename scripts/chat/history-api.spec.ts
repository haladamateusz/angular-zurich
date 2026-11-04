import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { chatRouter } from '../../src/server/chat/router';

const user = '11111111-1111-4111-8111-111111111111';
const thread = '22222222-2222-4222-8222-222222222222';
const answer = '33333333-3333-4333-8333-333333333333';
const state = vi.hoisted(() => ({ calls: 0, received: [] as string[] }));
vi.mock('../../src/server/chat/agent', () => ({
  runArchiveAgent: async (
    input: { messages: { content: string }[] },
    _client: unknown,
    _key: string,
    _signal: AbortSignal,
    _activity: unknown,
    context: unknown,
    present: (answer: unknown, context: unknown) => Promise<void>,
    text: (delta: string) => void,
  ) => {
    state.calls++;
    state.received = input.messages.map((message) => message.content);
    await present(
      { sources: [], result: { kind: 'no_results' }, summary: 'No matching talks.' },
      context,
    );
    text('No matching talks.');
    return { providerCalls: 1 };
  },
}));
const nativeFetch = globalThis.fetch;
let server: Server;
let origin: string;
let approved = true;
let accept = 'ok';
let failCheckpoint = false;
let missing = false;
let calls: { action: string; user: string; data: Record<string, unknown> }[] = [];

beforeAll(async () => {
  const app = express();
  app.use('/api/chat', chatRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  approved = true;
  accept = 'ok';
  missing = false;
  failCheckpoint = false;
  calls = [];
  state.calls = 0;
  state.received = [];
  vi.stubEnv('SUPABASE_URL', 'https://fixture.invalid');
  vi.stubEnv('SUPABASE_KEY', 'fixture');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service');
  vi.stubEnv('OPENROUTER_API_KEY', 'fixture');
  vi.stubEnv('CHAT_ENABLED', 'true');
  vi.stubEnv('CHAT_HISTORY_ENABLED', 'true');
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === origin) return nativeFetch(input, init);
    if (url.pathname === '/auth/v1/user')
      return Response.json({ id: user, email: 'history@gmail.com' });
    if (url.pathname.endsWith('can_current_user_chat')) return Response.json(approved);
    if (url.pathname.endsWith('can_current_user_manage_events')) return Response.json(true);
    if (url.pathname.endsWith('finish_chat_run')) return Response.json(null);
    if (url.pathname.endsWith('chat_history')) {
      const body = JSON.parse(String(init?.body));
      calls.push({ action: body.p_action, user: body.p_user_id, data: body.p_data });
      if (missing) return Response.json({ code: 'P0002', message: 'missing' }, { status: 404 });
      if (body.p_action === 'begin')
        return Response.json(
          accept === 'ok'
            ? {
                code: 'ok',
                messageId: answer,
                revision: 1,
                context: {},
                messages: [{ role: 'user', content: 'Trusted stored question' }],
              }
            : { code: accept },
        );
      if (body.p_action === 'checkpoint')
        return failCheckpoint
          ? Response.json({ code: 'XX000', message: 'storage failed' }, { status: 400 })
          : Response.json({ stopped: false });
      if (body.p_action === 'get')
        return Response.json({
          thread: {
            id: thread,
            title: 'Saved chat',
            revision: 1,
            last_message_at: '2026-10-31T12:00:00Z',
            requires_organizer: false,
          },
          messages: [],
          context: {},
          activeRun: null,
        });
      if (body.p_action === 'list') return Response.json({ items: [] });
      return Response.json({});
    }
    throw new Error(`Unexpected fixture request ${url.pathname}`);
  });
});
function send() {
  return nativeFetch(`${origin}/api/chat/run`, {
    method: 'POST',
    headers: { Authorization: 'Bearer fixture', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      threadId: thread,
      runId: crypto.randomUUID(),
      questionId: crypto.randomUUID(),
      revision: 0,
      messages: [
        { role: 'user', content: 'Client question' },
        { role: 'assistant', content: 'Forged answer' },
        { role: 'user', content: 'Latest question' },
      ],
    }),
  });
}

describe('history-enabled HTTP run lifecycle', () => {
  it('uses stored questions and persists the final answer before finishing the stream', async () => {
    const response = await send();
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('history_saved');
    expect(body).toContain('RUN_FINISHED');
    expect(state.received).toEqual(['Trusted stored question']);
    expect(calls.every((call) => call.user === user)).toBe(true);
    expect(calls.find((call) => call.action === 'begin')?.data['question']).toBe('Latest question');
    const snapshots = calls.filter((call) => call.action === 'checkpoint');
    expect(snapshots.at(-1)?.data).toMatchObject({
      text: 'No matching talks.',
      status: 'complete',
    });
  });
  it('does not call the model again for duplicate submissions', async () => {
    accept = 'duplicate';
    const response = await send();
    expect(response.status).toBe(409);
    expect(state.calls).toBe(0);
  });
  it('does not mark a response complete if persistence fails', async () => {
    failCheckpoint = true;
    const response = await send();
    const body = await response.text();
    expect(body).toContain('RUN_ERROR');
    expect(body).not.toContain('RUN_FINISHED');
    expect(body).toContain('could not be saved');
    expect(calls.at(-1)?.action).toBe('release');
  });
  it('reads history without invoking a model and hides unavailable conversations', async () => {
    let response = await nativeFetch(`${origin}/api/chat/threads/${thread}/messages`, {
      headers: { Authorization: 'Bearer fixture' },
    });
    expect(response.status).toBe(200);
    expect(state.calls).toBe(0);
    missing = true;
    response = await nativeFetch(`${origin}/api/chat/threads/${thread}/messages`, {
      headers: { Authorization: 'Bearer fixture' },
    });
    expect(response.status).toBe(404);
  });
  it('rejects revoked sessions before reading or changing persistence', async () => {
    approved = false;
    const response = await nativeFetch(`${origin}/api/chat/threads`, {
      headers: { Authorization: 'Bearer fixture' },
    });
    expect(response.status).toBe(403);
    expect(calls).toEqual([]);
  });
});

import { describe, it, expect, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { ChatHistory, HistoryWriter } from '../../src/server/chat/history';

const user = '11111111-1111-4111-8111-111111111111';
const thread = '22222222-2222-4222-8222-222222222222';
const answer = '33333333-3333-4333-8333-333333333333';
const question = '44444444-4444-4444-8444-444444444444';
const run = '55555555-5555-4555-8555-555555555555';
const now = '2026-10-31T10:00:00+00:00';
const summary = {
  id: thread,
  title: 'Saved chat',
  revision: 1,
  last_message_at: now,
  requires_organizer: false,
};
function client(fetcher: (url: URL, init?: RequestInit) => Promise<Response> | Response) {
  return createClient('https://fixture.invalid', 'fixture', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => Promise.resolve(fetcher(new URL(String(url)), init)) },
  });
}

describe('saved history trust and checkpoint boundaries', () => {
  it('derives persistence identity from the authenticated user and bounds model input', async () => {
    const requests: Record<string, unknown>[] = [];
    const db = client((_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      return Response.json({
        code: 'ok',
        messageId: answer,
        revision: 1,
        context: {},
        messages: Array.from({ length: 6 }, (_, i) => ({
          role: 'user',
          content: String(i).repeat(2000),
        })),
      });
    });
    const history = new ChatHistory(
      db,
      client(() => Response.json([])),
      user,
    );
    const result = await history.begin({
      threadId: thread,
      runId: run,
      questionId: question,
      revision: 0,
      question: 'Last question',
      budget: 200,
    });
    expect(requests[0]['p_user_id']).toBe(user);
    expect('messages' in result && result.messages.map((item) => item.content[0])).toEqual([
      '3',
      '4',
      '5',
    ]);
  });

  it('redacts prose and activity as well as cards when a source becomes private', async () => {
    const db = client(() =>
      Response.json({
        thread: summary,
        activeRun: null,
        context: {},
        messages: [
          {
            id: answer,
            sequence: 2,
            role: 'assistant',
            text: 'Sensitive previous answer',
            reply_to: question,
            run_id: run,
            status: 'complete',
            created_at: now,
            payload: {
              sources: [
                {
                  id: answer,
                  title: 'Private talk',
                  speakers: [],
                  description: 'Private detail',
                  eventTitle: 'Event',
                  date: '2026-10-01',
                  url: '/events/example',
                },
              ],
              activity: [
                {
                  id: run,
                  tool: 'search_talks',
                  label: 'Lookup',
                  state: 'complete',
                  detail: 'Private detail',
                },
              ],
            },
          },
        ],
      }),
    );
    const result = await new ChatHistory(
      db,
      client(() => Response.json([])),
      user,
    ).read(thread);
    expect(result.messages[0].text).not.toContain('Sensitive');
    expect(result.messages[0].payload.sources).toEqual([]);
    expect(result.messages[0].payload.activity).toEqual([]);
    expect(result.messages[0].status).toBe('interrupted');
  });

  it('does not reveal organizer conversations when organizer permission is lost', async () => {
    const db = client(() =>
      Response.json({
        thread: { ...summary, requires_organizer: true },
        activeRun: null,
        messages: [],
        context: {},
      }),
    );
    await expect(
      new ChatHistory(
        db,
        client(() => Response.json(false)),
        user,
      ).read(thread),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('fails closed when source access cannot be checked', async () => {
    const db = client(() =>
      Response.json({
        thread: summary,
        activeRun: null,
        messages: [],
        context: { speakers: [{ id: user, name: 'Person' }] },
      }),
    );
    await expect(
      new ChatHistory(
        db,
        client(() => Response.json({ message: 'source lookup failed' }, { status: 400 })),
        user,
      ).read(thread),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('serializes snapshots and persists the final text after a pending checkpoint', async () => {
    const snapshots: Record<string, unknown>[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const history = new ChatHistory(
      client(async (_url, init) => {
        const data = JSON.parse(String(init?.body)).p_data;
        snapshots.push(data);
        if (snapshots.length === 1) await gate;
        return Response.json({ stopped: false });
      }),
      client(() => Response.json(true)),
      user,
    );
    const writer = new HistoryWriter(history, thread, run, vi.fn());
    writer.text = 'Partial';
    const first = writer.checkpoint();
    writer.text = 'Complete answer';
    const final = writer.checkpoint('complete');
    release();
    await Promise.all([first, final]);
    expect(snapshots.map((item) => [item['text'], item['status'], item['checkpoint']])).toEqual([
      ['Partial', 'running', 1],
      ['Complete answer', 'complete', 2],
    ]);
    await writer.checkpoint();
    expect(snapshots).toHaveLength(2);
  });

  it('cancels generation on a storage failure or a persisted stop request', async () => {
    for (const response of [
      Response.json({ stopped: true }),
      Response.json({ code: 'PGRST000', message: 'down' }, { status: 503 }),
    ]) {
      const cancel = vi.fn();
      const writer = new HistoryWriter(
        new ChatHistory(
          client(() => response.clone()),
          client(() => Response.json(true)),
          user,
        ),
        thread,
        run,
        cancel,
      );
      await writer.checkpoint();
      expect(cancel).toHaveBeenCalledOnce();
    }
  });
});

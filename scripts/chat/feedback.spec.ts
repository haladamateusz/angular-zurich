import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { feedbackCandidates, exportFeedback } from './export-feedback.mjs';
import { feedbackFileSchema, scoreFeedback, selectFeedbackCases } from './feedback-cases';
import { feedbackEvaluationClient } from './feedback-client';

const userId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const talkId = '33333333-3333-4333-8333-333333333333';
const row = {
  user_id: userId,
  message_id: messageId,
  question: 'Find talks about signals.',
  answer: 'An incorrect answer that must never become an expectation.',
  source_ids: [talkId],
  result: { kind: 'talks', total: 1 },
  updated_at: '2026-10-15T00:00:00+00:00',
};
const draft = () =>
  feedbackFileSchema.parse(feedbackCandidates([row], 'https://supabase.test.invalid'));
function reviewed() {
  const file = draft();
  file.cases[0] = {
    ...file.cases[0],
    status: 'ready',
    standalone: true,
    expectedBehavior: 'Return the verified signals talk.',
    expectations: { kind: 'talks', sourceIdsInclude: [talkId] },
  };
  return file;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('feedback review and scoring', () => {
  it('imports negative feedback as drafts without copying the disliked answer into expectations', () => {
    const file = draft();
    expect(file.cases[0]).toMatchObject({
      status: 'draft',
      standalone: false,
      expectedBehavior: '',
      expectations: null,
      observed: { answer: row.answer },
    });
    expect(JSON.stringify(file)).not.toContain(userId);
    expect(selectFeedbackCases(file, 6, 60)).toEqual([]);
    expect(feedbackCandidates([row], file.projectUrl).cases[0].id).toBe(file.cases[0].id);
  });

  it('requires human expectations and standalone questions before promotion', () => {
    const file = draft();
    file.cases[0].status = 'ready';
    expect(feedbackFileSchema.safeParse(file).success).toBe(false);
    expect(feedbackFileSchema.safeParse(reviewed()).success).toBe(true);
  });

  it('rejects duplicate IDs, weak checks and contradictory expectations', () => {
    const file = reviewed();
    file.cases.push(file.cases[0]);
    expect(feedbackFileSchema.safeParse(file).success).toBe(false);
    for (const expectations of [
      { kind: 'talks' },
      { kind: 'talks', sourceIdsInclude: [talkId], sourceIdsExclude: [talkId] },
      { kind: 'ranking', total: 2 },
      { kind: 'talks', past: 2 },
      { kind: 'stats', total: 1, inventedField: true },
    ]) {
      const candidate = reviewed();
      expect(
        feedbackFileSchema.safeParse({
          ...candidate,
          cases: [{ ...candidate.cases[0], expectations }],
        }).success,
      ).toBe(false);
    }
  });

  it('enforces budget and case limits before model calls, excluding drafts and ignored cases', () => {
    const file = reviewed();
    file.cases.push({ ...file.cases[0], id: 'ignored', status: 'ignored' });
    expect(selectFeedbackCases(file, 1, 10)).toHaveLength(1);
    expect(() => selectFeedbackCases(file, 1, 9)).toThrow('10 cents');
    for (const [limit, budget] of [
      [0, 60],
      [21, 200],
      [1.5, 60],
      [1, 201],
      [1, NaN],
    ])
      expect(() => selectFeedbackCases(file, limit, budget)).toThrow();
  });

  it('catches missing sources, wrong totals and unwanted answer text', () => {
    const result = scoreFeedback(
      {
        kind: 'stats',
        total: 5,
        past: 4,
        upcoming: 1,
        sourceIdsInclude: [talkId],
        sourceIdsExclude: [messageId],
        answerIncludes: ['Signals'],
        answerExcludes: ['pizza'],
      },
      {
        text: 'Pizza recipe',
        result: { kind: 'stats', total: 3, past: 3, upcoming: 0, years: [] },
        sources: [{ id: messageId }],
      },
    );
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(7);
  });

  it('checks ranking facts and matching answers without requiring exact prose', () => {
    const expectations = {
      kind: 'ranking' as const,
      ranking: [{ id: userId, rank: 1, talkCount: 3 }],
      answerIncludes: ['TOMAS'],
    };
    const answer = {
      text: 'Tomas has three matching talks.',
      sources: [],
      result: {
        kind: 'ranking' as const,
        rows: [{ id: userId, name: 'Tomas', rank: 1, talkCount: 3 }],
      },
    };
    expect(scoreFeedback(expectations, answer).passed).toBe(true);
    answer.result.rows[0].talkCount = 2;
    expect(scoreFeedback(expectations, answer).passed).toBe(false);
    expect(
      scoreFeedback({ kind: 'off_topic' }, { text: '', result: { kind: 'off_topic' }, sources: [] })
        .passed,
    ).toBe(false);
  });
});

describe('feedback export', () => {
  it('reads only negative feedback, writes a private file, and refuses to overwrite reviews', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'angular-feedback-export-'));
    try {
      vi.stubEnv('SUPABASE_URL', 'https://supabase.test.invalid');
      vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
      const fetchSpy = vi.fn(async (input: string, init: RequestInit) => {
        const url = new URL(String(input));
        expect(url.pathname).toBe('/rest/v1/chat_feedback');
        expect(url.searchParams.get('rating')).toBe('eq.not_quite');
        expect(url.searchParams.get('limit')).toBe('10');
        expect(init.method).toBe('GET');
        return Response.json([row]);
      });
      vi.stubGlobal('fetch', fetchSpy);
      const path = join(directory, 'cases.json');
      expect((await exportFeedback(path, 10)).count).toBe(1);
      const original = await readFile(path, 'utf8');
      expect(feedbackFileSchema.parse(JSON.parse(original)).cases[0].status).toBe('draft');
      expect(original).not.toContain('test-service');
      await expect(exportFeedback(path, 10)).rejects.toMatchObject({ code: 'EEXIST' });
      expect(await readFile(path, 'utf8')).toBe(original);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects invalid limits before any request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(exportFeedback('unused.json', 501)).rejects.toThrow('limit');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('read-only live evaluation client', () => {
  it('allows approved archive reads and blocks all table and write-tool access', async () => {
    const fetchSpy = vi.fn(async (_input: unknown, init: RequestInit) => {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer approved-session');
      return Response.json(true);
    });
    vi.stubGlobal('fetch', fetchSpy);
    const client = feedbackEvaluationClient(
      'https://supabase.test.invalid',
      'public-key',
      'approved-session',
    );
    expect((await client.rpc('can_current_user_chat')).data).toBe(true);
    expect((await client.rpc('query_chat_archive', { p_query: 'signals' })).data).toBe(true);
    for (const action of [
      client.rpc('publish_event'),
      client.from('Events').select('*'),
      client.from('Events').insert({}),
    ])
      expect((await action).error?.message).toContain('non-read-only');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

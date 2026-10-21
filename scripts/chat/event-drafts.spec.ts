import { describe, it, expect } from 'vitest';
import {
  approvalToken,
  verifyApproval,
  createEventDraftTools,
  createDraftSchema,
  updateDraftSchema,
} from '../../src/server/chat/event-drafts';
import { createClient } from '@supabase/supabase-js';
import { draftFixture } from './draft-fixture';

describe('event planning inputs and defaults', () => {
  it('returns speaker names with approved talk options', async () => {
    const submissionId = crypto.randomUUID();
    const talkId = crypto.randomUUID();
    const client = createClient('https://fixture.invalid', 'fixture', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async (input) => {
          const url = new URL(String(input));
          if (url.pathname.includes('/rpc/')) return Response.json(true);
          if (url.pathname.endsWith('/Talks')) {
            expect(url.searchParams.get('select')).toContain('speaker_links:SpeakerOnTalk');
            return Response.json([
              {
                id: talkId,
                title: 'Angular signals',
                source_talk_submission_id: submissionId,
                speaker_links: [
                  { speaker: { first_name: 'Tomas', last_name: 'Trajan' } },
                  { speaker: { first_name: 'Alex', last_name: 'Morgan' } },
                  { speaker: null },
                ],
              },
            ]);
          }
          if (url.pathname.endsWith('/organizer_talk_submissions'))
            return Response.json([{ id: submissionId }]);
          return Response.json([]);
        },
      },
    });
    const options = await createEventDraftTools(
      client,
      AbortSignal.timeout(1000),
      crypto.randomUUID(),
    ).options('');
    expect(options.talks).toEqual([
      { id: talkId, title: 'Angular signals', speakerNames: ['Tomas Trajan', 'Alex Morgan'] },
    ]);
  });
  it('omits null update fields without clearing saved values', () => {
    expect(
      updateDraftSchema.parse({
        draftId: draftFixture.id,
        expectedVersion: 3,
        fields: {
          title: null,
          startsAt: null,
          description: null,
          venueId: null,
          meetupUrl: 'https://www.meetup.com/angularzrh/events/placeholder/',
          imageUrl: null,
        },
      }).fields,
    ).toEqual({ meetupUrl: 'https://www.meetup.com/angularzrh/events/placeholder/' });
    expect(
      updateDraftSchema.parse({
        draftId: draftFixture.id,
        expectedVersion: 3,
        fields: { meetupUrl: '' },
      }).fields,
    ).toEqual({ meetupUrl: '' });
  });
  it('accepts unspecified optional draft fields from tool-calling providers as null', () => {
    expect(
      createDraftSchema.parse({
        title: 'November meetup',
        startsAt: '2026-11-25T18:00',
        description: null,
        venueId: null,
        meetupUrl: null,
        imageUrl: null,
      }),
    ).toMatchObject({ description: '', venueId: '', meetupUrl: '', imageUrl: '' });
  });
  it.each([
    {
      dates: ['2026-09-07T16:00:00Z', '2026-01-12T17:00:00Z', '2025-11-10T17:00:00Z'],
      expected: '18:00',
    },
    { dates: ['2026-09-07T16:00:00Z', '2026-01-12T18:00:00Z'], expected: null },
    { dates: [], expected: null },
  ])(
    'derives the usual time from recent published events in Zurich: $expected',
    async ({ dates, expected }) => {
      const client = createClient('https://fixture.invalid', 'fixture', {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: async (input) => {
            const url = new URL(String(input));
            if (url.pathname.includes('/rpc/')) return Response.json(true);
            if (url.pathname.endsWith('/Events')) {
              expect(url.searchParams.get('public')).toBe('eq.true');
              expect(url.searchParams.get('limit')).toBe('5');
              expect(url.searchParams.get('starts_at')).toMatch(/^lte\./);
              return Response.json(dates.map((starts_at) => ({ starts_at })));
            }
            return Response.json([]);
          },
        },
      });
      const options = await createEventDraftTools(
        client,
        AbortSignal.timeout(1000),
        crypto.randomUUID(),
      ).options('');
      expect(options.usualStartTime).toBe(expected);
    },
  );
});

describe('event publication approval', () => {
  const secret = 'server-only-test-key';
  it('binds approval to the exact draft, version, actor and expiry', () => {
    const token = approvalToken(draftFixture, draftFixture.created_by, secret);
    expect(() =>
      verifyApproval(token, draftFixture.id, 3, draftFixture.created_by, secret),
    ).not.toThrow();
    expect(() =>
      verifyApproval(token, crypto.randomUUID(), 3, draftFixture.created_by, secret),
    ).toThrow();
    expect(() =>
      verifyApproval(token, draftFixture.id, 4, draftFixture.created_by, secret),
    ).toThrow();
    expect(() => verifyApproval(token, draftFixture.id, 3, crypto.randomUUID(), secret)).toThrow();
    expect(() =>
      verifyApproval(token, draftFixture.id, 3, draftFixture.created_by, 'wrong-key'),
    ).toThrow();
    const expired = approvalToken(draftFixture, draftFixture.created_by, secret, Date.now() - 1);
    expect(() =>
      verifyApproval(expired, draftFixture.id, 3, draftFixture.created_by, secret),
    ).toThrow();
  });
  it.each(['', 'yes', 'confirmed=true', 'e30=.invalid', 'a.b.c'])(
    'rejects invented approval %s',
    (token) => {
      expect(() =>
        verifyApproval(token, draftFixture.id, 3, draftFixture.created_by, secret),
      ).toThrow();
    },
  );
});

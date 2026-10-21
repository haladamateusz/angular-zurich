import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { monthlyMeetupCapacity } from '../../src/server/chat/meetup-planning';

function setup(counts: Record<number, number> = {}, approved = true, failed = false) {
  const requests: URL[] = [];
  const client = createClient('https://capacity-fixture.invalid', 'fixture-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname.endsWith('/rpc/can_current_user_chat')) return Response.json(approved);
        requests.push(url);
        expect(url.pathname).toBe('/rest/v1/Events');
        expect(init?.method).toBe('HEAD');
        expect(url.searchParams.get('select')).toBe('id');
        expect(url.searchParams.get('public')).toBe('eq.true');
        expect(new Headers(init?.headers).get('prefer')).toContain('count=exact');
        const start = url.searchParams
          .getAll('starts_at')
          .find((value) => value.startsWith('gte.'))!
          .slice(4);
        const month = Number(
          new Intl.DateTimeFormat('en', { timeZone: 'Europe/Zurich', month: 'numeric' }).format(
            new Date(start),
          ),
        );
        return failed
          ? new Response(null, { status: 503 })
          : new Response(null, {
              headers: { 'content-range': `*/${counts[month] ?? 0}` },
            });
      },
    },
  });
  return {
    requests,
    run: (date: string) => monthlyMeetupCapacity(client, AbortSignal.timeout(2000), new Date(date)),
  };
}

describe('remaining monthly meetup capacity', () => {
  it('distinguishes October-inclusive capacity from new months uncovered by published events', async () => {
    const { run, requests } = setup({ 10: 1, 11: 27, 12: 0 });
    const result = await run('2026-10-19T12:00:00Z');
    expect(result).toMatchObject({
      asOf: '2026-10-19',
      year: 2026,
      totalSlots: 3,
      slotsAfterCurrentMonth: 2,
      additionalSlots: 1,
    });
    expect(result.months).toEqual([
      { month: 10, name: 'October', publishedEvents: 1 },
      { month: 11, name: 'November', publishedEvents: 27 },
      { month: 12, name: 'December', publishedEvents: 0 },
    ]);
    expect(requests).toHaveLength(3);
    const ordered = requests.toSorted((a, b) =>
      a.searchParams
        .getAll('starts_at')
        .join()
        .localeCompare(b.searchParams.getAll('starts_at').join()),
    );
    expect(ordered[0].searchParams.getAll('starts_at')).toEqual([
      'gte.2026-09-30T22:00:00.000Z',
      'lt.2026-10-31T23:00:00.000Z',
    ]);
    expect(ordered[2].searchParams.getAll('starts_at')).toEqual([
      'gte.2026-11-30T23:00:00.000Z',
      'lt.2026-12-31T23:00:00.000Z',
    ]);
  });
  it('uses the Zurich date when UTC is still in the previous month', async () => {
    const { run } = setup();
    expect(await run('2026-10-31T23:30:00Z')).toMatchObject({
      asOf: '2026-11-01',
      totalSlots: 2,
      slotsAfterCurrentMonth: 1,
      additionalSlots: 2,
    });
  });
  it('handles the final month without a next-month slot', async () => {
    const { run } = setup();
    expect(await run('2026-12-31T12:00:00Z')).toMatchObject({
      totalSlots: 1,
      slotsAfterCurrentMonth: 0,
      additionalSlots: 1,
    });
  });
  it('rolls to the new Zurich year and bounds database work to twelve exact counts', async () => {
    const { run, requests } = setup();
    expect(await run('2026-12-31T23:30:00Z')).toMatchObject({
      asOf: '2027-01-01',
      year: 2027,
      totalSlots: 12,
      slotsAfterCurrentMonth: 11,
      additionalSlots: 12,
    });
    expect(requests).toHaveLength(12);
  });
  it('denies revoked access before reading the schedule', async () => {
    const { run, requests } = setup({}, false);
    await expect(run('2026-10-19T12:00:00Z')).rejects.toThrow('access_revoked');
    expect(requests).toHaveLength(0);
  });
  it('does not treat failed counts as empty months', async () => {
    const { run } = setup({}, true, true);
    await expect(run('2026-10-19T12:00:00Z')).rejects.toThrow('archive_unavailable');
  });
});

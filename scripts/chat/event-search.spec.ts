import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createArchiveTools } from '../../src/server/chat/tools';
import { eventSearchSchema, openContext, sealContext } from '../../src/server/chat/context';

const event = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Angular meetup',
  slug: 'angular-meetup',
  starts_at: '2021-06-10T17:00:00Z',
};

function setup(rows: unknown = [event], approved = true, failed = false) {
  const requests: URL[] = [];
  const client = createClient('https://archive.test.invalid', 'public-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: 'Bearer caller-session' },
      fetch: async (input, init) => {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer caller-session');
        const url = new URL(String(input));
        requests.push(url);
        if (url.pathname.endsWith('/rpc/can_current_user_chat')) return Response.json(approved);
        expect(url.pathname).toBe('/rest/v1/Events');
        return failed ? Response.json({ message: 'Denied' }, { status: 403 }) : Response.json(rows);
      },
    },
  });
  return { tools: createArchiveTools(client, new AbortController().signal), requests };
}

describe('event year search', () => {
  it('filters event dates for 2021 and presents retrieved event IDs', async () => {
    const { tools, requests } = setup();
    const args = eventSearchSchema.parse({ fromYear: 2021, toYear: 2021 });
    expect(await tools.listEvents(args)).toEqual({
      items: [event],
      hasMore: false,
      nextOffset: null,
    });
    const params = requests[1].searchParams;
    expect(params.get('title')).toBeNull();
    expect(params.get('public')).toBe('eq.true');
    expect(params.getAll('starts_at')).toEqual([
      'gte.2021-01-01T00:00:00+01:00',
      'lt.2022-01-01T00:00:00+01:00',
    ]);
    await tools.present({ status: 'results', ids: [event.id] });
    expect(tools.answer()).toContain('Angular meetup');
    expect(tools.sources()).toMatchObject([{ id: event.id, date: '2021-06-10' }]);
    expect(tools.ready()).toBe(true);
  });

  it('combines title and inclusive year ranges, with stable pagination and portable filters', async () => {
    const { tools, requests } = setup(Array.from({ length: 11 }, () => event));
    const args = eventSearchSchema.parse({
      query: '100%_Angular',
      fromYear: 2020,
      toYear: 2022,
      offset: 10,
    });
    const result = await tools.listEvents(args);
    expect(result).toMatchObject({ hasMore: true, nextOffset: 20 });
    const params = requests[1].searchParams;
    expect(params.get('title')).toBe('ilike.%100\\%\\_Angular%');
    expect(params.getAll('starts_at')).toEqual([
      'gte.2020-01-01T00:00:00+01:00',
      'lt.2023-01-01T00:00:00+01:00',
    ]);
    expect(params.get('order')).toBe('starts_at.desc,id.asc');
    expect(params.get('offset')).toBe('10');
    expect(params.get('limit')).toBe('11');
    expect((result as { items: unknown[] }).items).toHaveLength(10);
    const context = openContext(
      sealContext(tools.context(), event.id, event.id, 'secret'),
      event.id,
      event.id,
      'secret',
    );
    expect(context.lastEventQuery).toEqual(args);
    expect(context.nextOffset).toBe(20);
  });

  it('accepts an empty year search as no results', async () => {
    const { tools } = setup([]);
    await tools.listEvents(eventSearchSchema.parse({ fromYear: 2021, toYear: 2021 }));
    await tools.present({ status: 'no_results', ids: [] });
    expect(tools.ready()).toBe(true);
    expect(tools.result()).toEqual({ kind: 'no_results' });
  });

  it('keeps unbounded searches compatible and supports one-sided bounds', async () => {
    for (const filter of [{}, { fromYear: 2021 }, { toYear: 2021 }]) {
      const { tools, requests } = setup();
      await tools.listEvents(eventSearchSchema.parse(filter));
      expect(requests[1].searchParams.getAll('starts_at')).toHaveLength(Object.keys(filter).length);
    }
  });

  it('rejects invalid bounds before reading data', async () => {
    expect(() => eventSearchSchema.parse({ fromYear: 1989 })).toThrow();
    expect(() => eventSearchSchema.parse({ toYear: 2021.5 })).toThrow();
    const { tools, requests } = setup();
    await expect(
      tools.listEvents(eventSearchSchema.parse({ fromYear: 2022, toYear: 2021 })),
    ).rejects.toThrow('invalid_year_range');
    expect(requests).toHaveLength(0);
  });

  it('denies revoked access before querying events', async () => {
    const { tools, requests } = setup([], false);
    await expect(tools.listEvents(eventSearchSchema.parse({}))).rejects.toThrow('access_revoked');
    expect(requests).toHaveLength(1);
  });

  it('does not report a failed database request as no results', async () => {
    const { tools } = setup([], true, true);
    await expect(tools.listEvents(eventSearchSchema.parse({}))).rejects.toThrow(
      'archive_unavailable',
    );
    await expect(tools.present({ status: 'no_results', ids: [] })).rejects.toThrow();
    expect(() => tools.answer()).toThrow();
  });
});

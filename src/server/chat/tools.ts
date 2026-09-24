import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ArchiveContext, archiveQuerySchema } from './context';
import { ChatResult } from '../../app/core/models/chat-result.model';
import { escapeMarkdown } from './policy';
import { ChatActivity } from '../../app/core/models/chat-activity.model';
import { ChatSource } from '../../app/core/models/chat-source.model';

const query = z.string().max(160).default('');
const offset = z.number().int().min(0).max(200).default(0);
const uuid = z.string().uuid();
export const searchSchema = z.object({ query, offset });
export const speakerSchema = z.object({ speakerId: uuid, offset });
export const eventSchema = z.object({ eventId: uuid, offset });
export const talkSchema = z.object({ talkId: uuid });
export const rankingSchema = z.object({ offset });
export const speakerNameSchema = z.object({
  name: z.string().trim().min(1).max(160),
  speakerId: uuid
    .refine((id) => id !== '00000000-0000-0000-0000-000000000000')
    .nullish()
    .transform((id) => id ?? undefined)
    .describe('Use null to resolve by name. Only supply an ID returned by an archive lookup.'),
  offset,
});
export const presentSchema = z.object({
  status: z.enum(['results', 'no_results', 'off_topic']),
  ids: z.array(uuid).max(10),
});

const talkRecord = z.object({
  id: uuid,
  title: z.string(),
  description: z.string().nullable(),
  event_id: uuid,
  event_title: z.string(),
  event_slug: z.string(),
  starts_at: z.string(),
  speakers: z.array(z.object({ id: uuid, name: z.string() })),
});
const eventRecord = z.object({
  id: uuid,
  title: z.string(),
  slug: z.string(),
  starts_at: z.string(),
});

export function createArchiveTools(
  client: SupabaseClient,
  signal: AbortSignal,
  onActivity: (activity: ChatActivity) => void = () => undefined,
  initialContext: ArchiveContext = { speakers: [], events: [] },
) {
  let context: ArchiveContext = structuredClone(initialContext);
  let result: ChatResult = { kind: 'no_results' };
  const records = new Map<string, string>();
  const sources = new Map<string, ChatSource>();
  let selectedSources: ChatSource[] = [];
  let calls = 0;
  let sawLookup = false;
  let sawMatches = false;
  let toolQueue: Promise<void> = Promise.resolve();
  let hasMore = false;
  let summary = '';
  let nextQuestion = '';
  let presented = false;
  let lookupFailed = false;
  let rankingReady = false;
  let answer =
    'I couldn’t find a matching published record. Try a speaker name, event title, or a shorter topic such as “signals”. Older meetup records may be incomplete.';

  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    signal.throwIfAborted();
    if (++calls > 8) throw new Error('tool_limit');
    const approval = await client.rpc('can_current_user_chat').abortSignal(signal);
    if (approval.error || approval.data !== true) throw new Error('access_revoked');
    const result = await client.rpc(name, args).abortSignal(signal);
    if (result.error) throw new Error('archive_unavailable');
    sawLookup = true;
    const data = result.data as { items?: unknown[]; speakers?: unknown[] } | null;
    sawMatches ||= Boolean(data?.items?.length || data?.speakers?.length);
    return result.data as unknown;
  }

  function rememberTalks(value: unknown) {
    const data = z
      .object({ items: z.array(talkRecord), hasMore: z.boolean(), nextOffset: z.number() })
      .parse(value);
    hasMore ||= data.hasMore;
    for (const talk of data.items) {
      sources.set(talk.id, {
        id: talk.id,
        title: talk.title,
        speakers: talk.speakers.map((speaker) => speaker.name),
        description: talk.description ?? '',
        eventTitle: talk.event_title,
        date: talk.starts_at.slice(0, 10),
        url: `/events/${encodeURIComponent(talk.event_slug)}`,
      });
      const speakers =
        talk.speakers.map((speaker) => escapeMarkdown(speaker.name)).join(', ') ||
        'Speaker not recorded';
      const date = talk.starts_at.slice(0, 10);
      records.set(
        talk.id,
        `- **${escapeMarkdown(talk.title)}** — ${speakers}\n  ${escapeMarkdown(talk.event_title)} · ${date} · [Event source](/events/${encodeURIComponent(talk.event_slug)})${talk.description ? `\n  ${escapeMarkdown(talk.description.slice(0, 240))}${talk.description.length > 240 ? '…' : ''}` : ''}`,
      );
    }
    return data;
  }

  async function search(args: Record<string, unknown>) {
    const data = rememberTalks(await rpc('search_chat_talks', args));
    context = {
      speakers: [],
      events: [],
      lastQuery: archiveQuerySchema.parse({
        query: args['p_query'],
        speakerId: args['p_speaker_id'],
        eventId: args['p_event_id'],
        offset: args['p_offset'],
      }),
      nextOffset: data.hasMore && data.nextOffset <= 200 ? data.nextOffset : undefined,
    };
    context.speakers = [
      ...new Map(data.items.flatMap((t) => t.speakers).map((p) => [p.id, p])).values(),
    ].slice(0, 10);
    return data;
  }

  async function entities(kind: 'speakers' | 'events', args: z.infer<typeof searchSchema>) {
    const data = await rpc('find_chat_entities', {
      p_kind: kind,
      p_query: args.query,
      p_offset: args.offset,
    });
    const candidates = z
      .object({
        items: z.array(
          z.object({ id: uuid, name: z.string().optional(), title: z.string().optional() }),
        ),
      })
      .parse(data);
    context = {
      ...context,
      [kind]: candidates.items
        .slice(0, 10)
        .map((p) => ({ id: p.id, name: p.name ?? p.title ?? '' })),
    };
    if (kind === 'events') {
      const parsed = z.object({ items: z.array(eventRecord) }).parse(data);
      for (const event of parsed.items) {
        sources.set(event.id, {
          id: event.id,
          title: event.title,
          speakers: [],
          description: '',
          eventTitle: '',
          date: event.starts_at.slice(0, 10),
          url: `/events/${encodeURIComponent(event.slug)}`,
        });
        records.set(
          event.id,
          `- **${escapeMarkdown(event.title)}** · ${event.starts_at.slice(0, 10)} · [Event source](/events/${encodeURIComponent(event.slug)})`,
        );
      }
    }
    return data;
  }

  async function speakerArchive(args: z.infer<typeof speakerNameSchema>) {
    const data = z
      .object({
        speakers: z.array(z.object({ id: uuid, name: z.string() })),
        ambiguous: z.boolean(),
        stats: z
          .object({
            total: z.number().int().nonnegative(),
            past: z.number().int().nonnegative(),
            upcoming: z.number().int().nonnegative(),
            years: z.array(
              z.object({
                year: z.number().int(),
                past: z.number().int(),
                upcoming: z.number().int(),
              }),
            ),
          })
          .optional(),
        page: z
          .object({ items: z.array(talkRecord), hasMore: z.boolean(), nextOffset: z.number() })
          .optional(),
      })
      .parse(
        await rpc('get_chat_speaker_archive', {
          p_name: args.name,
          p_speaker_id: args.speakerId ?? null,
          p_offset: args.offset,
        }),
      );
    context = { speakers: data.speakers.slice(0, 10), events: [] };
    if (data.ambiguous) {
      result = { kind: 'clarification' };
      answer = `More than one speaker matches. Please use a full name: ${data.speakers.map((p) => p.name).join(', ')}.`;
      summary = answer;
      selectedSources = [];
      presented = true;
      return data;
    }
    if (!data.speakers.length) return data;
    if (!data.stats || !data.page) throw new Error('archive_unavailable');
    const { stats, page } = data;
    context.focusSpeakerId = data.speakers[0].id;
    result = { kind: 'stats', ...stats };
    context.lastQuery = archiveQuerySchema.parse({
      mode: 'stats',
      speakerId: data.speakers[0].id,
      offset: args.offset,
    });
    context.nextOffset = page.hasMore && page.nextOffset <= 200 ? page.nextOffset : undefined;
    const name = data.speakers[0].name;
    rememberTalks(page);
    summary = `${name} has ${stats.past} talk${stats.past === 1 ? '' : 's'} at past Angular Zürich events in the published archive.`;
    if (stats.upcoming)
      summary += ` ${stats.upcoming} additional talk${stats.upcoming === 1 ? ' is' : 's are'} scheduled at upcoming events.`;
    summary +=
      '\n\nBy year: ' +
      stats.years
        .map((y) => `${y.year}: ${y.past} past${y.upcoming ? `, ${y.upcoming} upcoming` : ''}`)
        .join(' · ');
    summary += `\n\nShowing ${page.items.length ? args.offset + 1 : 0}–${args.offset + page.items.length} of ${stats.total} published talks. Counts reflect stored records; older records may be incomplete.`;
    nextQuestion = page.hasMore
      ? `Show talks by ${name}, starting at offset ${page.nextOffset}.`
      : '';
    selectedSources = page.items.flatMap((t) => {
      const source = sources.get(t.id);
      return source ? [source] : [];
    });
    answer = summary;
    presented = true;
    return data;
  }

  async function rankSpeakers(args: z.infer<typeof rankingSchema>) {
    const data = z
      .object({
        items: z.array(
          z.object({
            id: uuid,
            name: z.string(),
            talkCount: z.number().int().positive(),
            rank: z.number().int().positive(),
          }),
        ),
        totalSpeakers: z.number().int().nonnegative(),
        highestCount: z.number().int().nonnegative(),
        leaderCount: z.number().int().nonnegative(),
        hasMore: z.boolean(),
        nextOffset: z.number().int().nonnegative(),
      })
      .parse(await rpc('rank_chat_speakers', { p_offset: args.offset }));
    result = { kind: 'ranking', rows: data.items };
    context = {
      speakers: data.items.map((p) => ({ id: p.id, name: p.name })),
      events: [],
      lastQuery: archiveQuerySchema.parse({ mode: 'ranking', period: 'past', offset: args.offset }),
      nextOffset: data.hasMore && data.nextOffset <= 200 ? data.nextOffset : undefined,
    };
    const leaders = data.items.filter((speaker) => speaker.rank === 1);
    if (data.leaderCount === 1 && leaders.length) context.focusSpeakerId = leaders[0].id;
    summary = !data.totalSpeakers
      ? 'No speakers with talks at past published Angular Zürich events were found.'
      : data.leaderCount === 1 && leaders.length
        ? `${leaders[0].name} has given the most talks in the published Angular Zürich archive: ${data.highestCount}.`
        : data.leaderCount > 1
          ? `${data.leaderCount} speakers are tied for the most talks in the published Angular Zürich archive, with ${data.highestCount} each.`
          : 'Angular Zürich speakers ranked by talks at past published events.';
    if (data.items.length)
      summary +=
        '\n\n' +
        data.items
          .map(
            (speaker) =>
              `${speaker.rank}. ${speaker.name} — ${speaker.talkCount} talk${speaker.talkCount === 1 ? '' : 's'}`,
          )
          .join('\n');
    summary += `\n\nCounts cover all stored past published events, including historical talks, and exclude upcoming events. Co-presented talks count once for each speaker. Older records may be incomplete.`;
    if (data.hasMore)
      summary += ` Showing ${args.offset + 1}–${args.offset + data.items.length} of ${data.totalSpeakers} speakers.`;
    selectedSources = [];
    nextQuestion = data.hasMore
      ? `Show the speaker ranking, starting at offset ${data.nextOffset}.`
      : '';
    answer = summary;
    rankingReady = true;
    presented = true;
    return data;
  }

  async function queryArchive(args: z.infer<typeof archiveQuerySchema>) {
    if (args.fromYear !== undefined && args.toYear !== undefined && args.fromYear > args.toYear)
      throw new Error('invalid_filters');
    const filters = { ...args, period: args.mode === 'ranking' ? ('past' as const) : args.period };
    const data = z
      .object({
        items: z.array(z.unknown()),
        total: z.number().int().nonnegative(),
        past: z.number().int().nonnegative(),
        upcoming: z.number().int().nonnegative(),
        years: z.array(
          z.object({
            year: z.number().int(),
            past: z.number().int().nonnegative(),
            upcoming: z.number().int().nonnegative(),
          }),
        ),
        totalSpeakers: z.number().int().nonnegative(),
        hasMore: z.boolean(),
        nextOffset: z.number().int(),
      })
      .parse(
        await rpc('query_chat_archive', {
          p_mode: filters.mode,
          p_query: filters.query,
          p_speaker_id: filters.speakerId ?? null,
          p_event_id: filters.eventId ?? null,
          p_from_year: filters.fromYear ?? null,
          p_to_year: filters.toYear ?? null,
          p_period: filters.period,
          p_offset: filters.offset,
        }),
      );
    context = {
      speakers: [],
      events: [],
      lastQuery: filters,
      nextOffset: data.hasMore ? data.nextOffset : undefined,
    };
    context.focusSpeakerId = filters.speakerId;
    const scope = [
      filters.query ? `topic “${filters.query}”` : '',
      filters.fromYear ? `from ${filters.fromYear}` : '',
      filters.toYear ? `through ${filters.toYear}` : '',
      `${filters.period} published events`,
    ]
      .filter(Boolean)
      .join(', ');
    if (filters.mode === 'ranking') {
      const rows = z
        .array(
          z.object({
            id: uuid,
            name: z.string(),
            talkCount: z.number().int().positive(),
            rank: z.number().int().positive(),
          }),
        )
        .max(10)
        .parse(data.items);
      result = rows.length ? { kind: 'ranking', rows } : { kind: 'no_results' };
      const leaders = rows.filter((p) => p.rank === 1);
      if (leaders.length === 1) context.focusSpeakerId = leaders[0].id;
      context.speakers = rows.map((p) => ({ id: p.id, name: p.name }));
      summary = rows.length
        ? `Speakers ranked by matching talks: ${scope}.`
        : `No speakers matched these filters: ${scope}.`;
      answer =
        summary +
        '\n\n' +
        rows.map((p) => `${p.rank}. ${p.name} — ${p.talkCount} talks`).join('\n');
      selectedSources = [];
    } else {
      const page = rememberTalks(data);
      context.speakers = [
        ...new Map(page.items.flatMap((t) => t.speakers).map((p) => [p.id, p])).values(),
      ].slice(0, 10);
      context.events = [
        ...new Map(
          page.items.map((t) => [t.event_id, { id: t.event_id, name: t.event_title }]),
        ).values(),
      ].slice(0, 10);
      selectedSources = page.items.flatMap((t) => {
        const source = sources.get(t.id);
        return source ? [source] : [];
      });
      result =
        data.total === 0
          ? { kind: 'no_results' }
          : filters.mode === 'stats'
            ? {
                kind: 'stats',
                total: data.total,
                past: data.past,
                upcoming: data.upcoming,
                years: data.years,
              }
            : { kind: 'talks', total: data.total };
      summary = `${data.total} matching talk${data.total === 1 ? '' : 's'}: ${scope}. ${data.past} past, ${data.upcoming} upcoming.`;
      answer = summary;
    }
    const totalRows = filters.mode === 'ranking' ? data.totalSpeakers : data.total;
    summary += `\nShowing ${data.items.length ? filters.offset + 1 : 0}–${filters.offset + data.items.length} of ${totalRows}. Older records may be incomplete.`;
    answer += `\nShowing ${data.items.length ? filters.offset + 1 : 0}–${filters.offset + data.items.length} of ${totalRows}. Older records may be incomplete.`;
    nextQuestion = data.hasMore ? 'Show the next page of these results.' : '';
    presented = true;
    return data;
  }

  function traced<T>(tool: string, label: string, execute: (args: T) => Promise<unknown>) {
    return (args: T) => {
      const task = toolQueue.then(async () => {
        if (lookupFailed) throw new Error('archive_unavailable');
        if (presented)
          return { accepted: false, reason: 'The verified answer is already complete.' };
        signal.throwIfAborted();
        const id = crypto.randomUUID();
        const start = performance.now();
        const detail = JSON.stringify(args).slice(0, 400);
        onActivity({ id, tool, label, state: 'running', detail });
        try {
          const result = await execute(args);
          signal.throwIfAborted();
          const value = result as {
            items?: unknown[];
            speakers?: unknown[];
            stats?: { total: number };
            page?: { items: unknown[] };
          };
          const count = value.page?.items.length ?? value.items?.length ?? value.speakers?.length;
          const outcome = value.stats
            ? `${value.stats.total} published talks; ${count} loaded`
            : count === undefined
              ? 'Done'
              : `${count} matching records`;
          onActivity({
            id,
            tool,
            label,
            state: 'complete',
            detail: `${detail} · ${outcome}`,
            durationMs: Math.round(performance.now() - start),
          });
          return result;
        } catch (error) {
          lookupFailed = true;
          if (!signal.aborted)
            onActivity({
              id,
              tool,
              label,
              state: 'failed',
              detail:
                tool === 'present_results'
                  ? 'The answer could not be matched to retrieved records.'
                  : 'The archive lookup failed.',
              durationMs: Math.round(performance.now() - start),
            });
          throw error;
        }
      });
      toolQueue = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    };
  }

  return {
    ready: () => presented && !lookupFailed,
    context: () => context,
    result: () => result,
    queryArchive: traced('query_archive', 'Filter and summarize the archive', queryArchive),
    clarify: traced(
      'clarify',
      'Clarify the search',
      async (args: { reason: 'speaker' | 'event' | 'reference' | 'filters' }) => {
        answer = {
          speaker: 'Which Angular Zürich speaker do you mean? Please give their full name.',
          event: 'Which Angular Zürich event do you mean? Please give its name or date.',
          reference: 'Which Angular Zürich speaker, talk or event are you referring to?',
          filters:
            'Which topic, speaker, event or years should I search in the Angular Zürich archive?',
        }[args.reason];
        summary = answer;
        result = { kind: 'clarification' };
        presented = true;
        return { accepted: true };
      },
    ),
    searchTalks: traced(
      'search_talks',
      'Search talk titles and descriptions',
      (args: z.infer<typeof searchSchema>) =>
        search({ p_query: args.query, p_offset: args.offset }),
    ),
    findSpeakers: traced('find_speakers', 'Find speakers', (args: z.infer<typeof searchSchema>) =>
      entities('speakers', args),
    ),
    listEvents: traced(
      'list_events',
      'Find published events',
      (args: z.infer<typeof searchSchema>) => entities('events', args),
    ),
    talksBySpeaker: traced(
      'get_talks_by_speaker',
      'Read speaker talks',
      (args: z.infer<typeof speakerSchema>) =>
        search({ p_speaker_id: args.speakerId, p_offset: args.offset }),
    ),
    talksByEvent: traced(
      'get_talks_by_event',
      'Read event talks',
      (args: z.infer<typeof eventSchema>) =>
        search({ p_event_id: args.eventId, p_offset: args.offset }),
    ),
    getTalk: traced('get_talk', 'Read talk details', (args: z.infer<typeof talkSchema>) =>
      search({ p_talk_id: args.talkId }),
    ),
    speakerTalks: traced(
      'get_speaker_talks',
      'Find a speaker and list their talks',
      speakerArchive,
    ),
    speakerStats: traced('get_speaker_stats', 'Count speaker talks across years', speakerArchive),
    rankSpeakers: traced('rank_speakers', 'Rank speakers by total past talks', rankSpeakers),
    present: traced(
      'present_results',
      'Prepare the answer from sources',
      async (args: z.infer<typeof presentSchema>) => {
        if (args.status === 'off_topic') {
          result = { kind: 'off_topic' };
          context = { speakers: [], events: [] };
          rankingReady = false;
          selectedSources = [];
          summary = '';
          nextQuestion = '';
          answer =
            'I can help with Angular Zürich talks, speakers, and events. Try “Who gave a talk about signals?”';
        } else if (args.status === 'results') {
          result = { kind: 'talks' };
          // Aggregate answers are constructed from validated database counts,
          // not from model-supplied prose or invented talk IDs.
          if (rankingReady && !args.ids.length) return { accepted: true };
          const selected = [...new Set(args.ids)].map((id) => records.get(id));
          if (!selected.length || selected.some((record) => !record))
            throw new Error('ungrounded_answer');
          selectedSources = [...new Set(args.ids)].flatMap((id) => {
            const source = sources.get(id);
            return source ? [source] : [];
          });
          answer = `${summary || 'From the published Angular Zürich archive:'}\n\n${selected.join('\n\n')}\n\n${hasMore ? 'More matches are available; narrow your search or ask for the next page. ' : ''}Older meetup records may be incomplete.`;
        } else if (selectedSources.length || rankingReady) {
          // A model cannot erase a successful speaker lookup with a contradictory no-results status.
          return {
            accepted: false,
            reason: rankingReady
              ? 'A database ranking is ready. Present results with an empty IDs array.'
              : 'Published speaker records were found. Present their IDs.',
          };
        }
        if (args.status === 'no_results' && (!sawLookup || sawMatches))
          throw new Error('ungrounded_answer');
        presented = true;
        return { accepted: true };
      },
    ),
    answer: () => {
      if (lookupFailed) throw new Error('archive_unavailable');
      if (!presented) throw new Error('incomplete_search');
      return answer;
    },
    sources: () => selectedSources,
    summary: () => summary,
    nextQuestion: () => nextQuestion,
  };
}

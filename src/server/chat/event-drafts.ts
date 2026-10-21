import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AssignableTalk } from '../../app/core/models/event-management.interface';
import {
  eventDraftFieldsSchema,
  eventDraftSchema,
  EventDraft,
} from '../../app/core/models/event-draft.model';

export const draftRefSchema = z.object({
  draftId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
});
export const createDraftSchema = eventDraftFieldsSchema.extend({
  description: z
    .string()
    .max(4000)
    .nullish()
    .transform((value) => value ?? ''),
  startsAt: eventDraftFieldsSchema.shape.startsAt.nullish().transform((value) => value ?? ''),
  venueId: eventDraftFieldsSchema.shape.venueId.nullish().transform((value) => value ?? ''),
  meetupUrl: eventDraftFieldsSchema.shape.meetupUrl.nullish().transform((value) => value ?? ''),
  imageUrl: eventDraftFieldsSchema.shape.imageUrl.nullish().transform((value) => value ?? ''),
});
export const updateDraftSchema = draftRefSchema.extend({
  fields: z
    .object({
      title: eventDraftFieldsSchema.shape.title.nullish(),
      description: eventDraftFieldsSchema.shape.description.nullish(),
      startsAt: eventDraftFieldsSchema.shape.startsAt.nullish(),
      venueId: eventDraftFieldsSchema.shape.venueId.nullish(),
      meetupUrl: eventDraftFieldsSchema.shape.meetupUrl.nullish(),
      imageUrl: eventDraftFieldsSchema.shape.imageUrl.nullish(),
    })
    .transform((fields) =>
      Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== null && value !== undefined),
      ),
    ),
});
export const draftTalkSchema = draftRefSchema.extend({
  title: z.string().trim().min(3).max(160),
  description: z.string().min(1).max(5000),
  speakerIds: z.array(z.string().uuid()).min(1).max(5),
});
export const attachDraftTalkSchema = draftRefSchema.extend({ talkId: z.string().uuid() });
export const draftIdSchema = z.object({ draftId: z.string().uuid() });

export class DraftError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
export function createEventDraftTools(
  client: SupabaseClient,
  signal: AbortSignal,
  threadId: string,
) {
  let operations = 0;
  async function authorize() {
    signal.throwIfAborted();
    if (++operations > 12)
      throw new DraftError('Too many draft operations in one request. Continue in a new message.');
    for (const rpc of ['can_current_user_chat', 'can_current_user_manage_events']) {
      const { data, error } = await client.rpc(rpc).abortSignal(signal);
      if (error || data !== true) throw new DraftError('Organizer access is required.', 403);
    }
  }
  async function mutate(action: string, id: string | null, version: number | null, data: unknown) {
    await authorize();
    const result = await client
      .rpc('mutate_chat_event_draft', {
        p_action: action,
        p_id: id,
        p_version: version,
        p_data: data,
      })
      .abortSignal(signal);
    if (result.error)
      throw new DraftError(
        result.error.code === '40001'
          ? 'This draft changed. Reload it before editing or publishing.'
          : 'The draft could not be saved. Check its fields and selected talks.',
        result.error.code === '40001' ? 409 : 400,
      );
    return eventDraftSchema.parse(result.data);
  }
  async function get({ draftId }: z.infer<typeof draftIdSchema>) {
    await authorize();
    const { data, error } = await client
      .from('chat_event_drafts')
      .select('*')
      .eq('id', draftId)
      .abortSignal(signal)
      .maybeSingle();
    if (error || !data) throw new DraftError('Draft not found or unavailable.', 404);
    return eventDraftSchema.parse(data);
  }
  return {
    get,
    async audit(draftId: string) {
      await authorize();
      const { data, error } = await client
        .from('chat_event_draft_audit')
        .select('id,actor_id,action,version,created_at')
        .eq('draft_id', draftId)
        .order('created_at', { ascending: false })
        .limit(30)
        .abortSignal(signal);
      if (error) throw new DraftError('Draft history could not be loaded.', 503);
      return data;
    },
    async options(query: string) {
      await authorize();
      const escaped = query.replace(/[\\%_]/g, '\\$&').replaceAll('*', '');
      const [venues, speakers, talks, recentEvents] = await Promise.all([
        client
          .from('Venues')
          .select('id,title,street,city')
          .order('title')
          .limit(30)
          .abortSignal(signal),
        client
          .from('People')
          .select('id,first_name,last_name')
          .order('first_name')
          .limit(100)
          .abortSignal(signal),
        client
          .from('Talks')
          .select(
            `id,title,source_talk_submission_id,
            speaker_links:SpeakerOnTalk(speaker:People(first_name,last_name))`,
          )
          .is('event_id', null)
          .not('source_talk_submission_id', 'is', null)
          .ilike('title', `%${escaped}%`)
          .order('title')
          .limit(100)
          .returns<AssignableTalk[]>()
          .abortSignal(signal),
        client
          .from('Events')
          .select('starts_at')
          .eq('public', true)
          .lte('starts_at', new Date().toISOString())
          .order('starts_at', { ascending: false })
          .limit(5)
          .abortSignal(signal),
      ]);
      if (venues.error || speakers.error || talks.error || recentEvents.error)
        throw new DraftError('Event options could not be loaded.', 503);
      const approved = talks.data.length
        ? await client
            .from('organizer_talk_submissions')
            .select('id')
            .eq('status', 'approved')
            .in(
              'id',
              talks.data.map((talk) => talk.source_talk_submission_id),
            )
            .abortSignal(signal)
        : { data: [], error: null };
      if (approved.error) throw new DraftError('Approved talks could not be loaded.', 503);
      const ids = new Set(approved.data?.map((item) => item.id));
      const times = new Map<string, number>();
      const clock = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Zurich',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      for (const event of recentEvents.data) {
        const date = new Date(event.starts_at);
        if (!Number.isFinite(date.getTime())) continue;
        const time = clock.format(date);
        times.set(time, (times.get(time) ?? 0) + 1);
      }
      const common = [...times].sort((a, b) => b[1] - a[1])[0];
      return {
        usualStartTime:
          common && common[1] >= Math.max(2, Math.ceil(recentEvents.data.length * 0.6))
            ? common[0]
            : null,
        venues: venues.data,
        speakers: speakers.data,
        talks: talks.data
          .filter((talk) => ids.has(talk.source_talk_submission_id))
          .slice(0, 30)
          .map(({ id, title, speaker_links }) => ({
            id,
            title,
            speakerNames: speaker_links
              .map(({ speaker }) =>
                [speaker?.first_name, speaker?.last_name]
                  .filter((name): name is string => Boolean(name?.trim()))
                  .join(' '),
              )
              .filter((name) => name.length > 0),
          })),
      };
    },
    create(args: z.infer<typeof createDraftSchema>) {
      const fields = createDraftSchema.parse(args);
      const requestKey = createHash('sha256')
        .update(JSON.stringify([fields.title.toLowerCase(), fields.startsAt]))
        .digest('hex');
      return mutate('create', null, null, { ...fields, threadId, requestKey });
    },
    update(args: z.infer<typeof updateDraftSchema>) {
      return mutate('update', args.draftId, args.expectedVersion, args.fields);
    },
    createTalk(args: z.infer<typeof draftTalkSchema>) {
      // Stable ID makes retries of the same proposed talk fail safely instead of duplicating it.
      const hex = createHash('sha256')
        .update(JSON.stringify([args.draftId, args.title, args.speakerIds]))
        .digest('hex');
      const talkId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
      return mutate('create_talk', args.draftId, args.expectedVersion, { ...args, talkId });
    },
    attach(args: z.infer<typeof attachDraftTalkSchema>) {
      return mutate('attach', args.draftId, args.expectedVersion, { talkId: args.talkId });
    },
    remove(args: z.infer<typeof attachDraftTalkSchema>) {
      return mutate('remove_talk', args.draftId, args.expectedVersion, { talkId: args.talkId });
    },
    discard(args: z.infer<typeof draftRefSchema>) {
      return mutate('discard', args.draftId, args.expectedVersion, {});
    },
  };
}

export function approvalToken(
  draft: EventDraft,
  userId: string,
  secret: string,
  expires = Date.now() + 300_000,
) {
  const payload = Buffer.from(
    JSON.stringify({ id: draft.id, version: draft.version, userId, expires }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', secret)
    .update('event-approval:' + payload)
    .digest('base64url')}`;
}
export function verifyApproval(
  token: string,
  id: string,
  version: number,
  userId: string,
  secret: string,
) {
  const [payload, signature, ...extra] = token.split('.');
  if (!payload || !signature || extra.length)
    throw new DraftError('Review this draft again before publishing.', 409);
  const expected = createHmac('sha256', secret)
    .update('event-approval:' + payload)
    .digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new DraftError('Review this draft again before publishing.', 409);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    throw new DraftError('Invalid approval.', 409);
  }
  const claim = z
    .object({
      id: z.literal(id),
      version: z.literal(version),
      userId: z.literal(userId),
      expires: z
        .number()
        .min(Date.now())
        .max(Date.now() + 301_000),
    })
    .safeParse(parsed);
  if (!claim.success)
    throw new DraftError('Approval expired or the draft changed. Review it again.', 409);
}

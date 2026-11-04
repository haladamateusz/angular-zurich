import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  chatThreadSchema,
  savedMessageSchema,
  savedMessagePayloadSchema,
  SavedMessagePayload,
} from '../../app/core/models/chat-history.model';
import { ArchiveContext, archiveContextSchema } from './context';

export class HistoryError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class ChatHistory {
  constructor(
    private readonly database: SupabaseClient,
    private readonly caller: SupabaseClient,
    private readonly userId: string,
  ) {}

  async call(action: string, data: Record<string, unknown>): Promise<unknown> {
    const result = await this.database
      .rpc('chat_history', {
        p_user_id: this.userId,
        p_action: action,
        p_data: data,
      })
      .abortSignal(AbortSignal.timeout(10_000));
    if (result.error) {
      const code = result.error.code;
      throw new HistoryError(
        code === 'P0002'
          ? 'This conversation is unavailable.'
          : code === '42501'
            ? 'Your chat access has changed. Sign in again.'
            : code === '40001'
              ? 'This conversation changed or is still responding. Reload it before trying again.'
              : 'We couldn’t save or load this conversation. Please try again.',
        code === 'P0002' ? 404 : code === '42501' ? 403 : code === '40001' ? 409 : 503,
      );
    }
    return result.data;
  }

  async organizer() {
    const result = await this.caller.rpc('can_current_user_manage_events');
    if (result.error) throw new HistoryError('Chat permissions could not be checked.', 503);
    return result.data === true;
  }

  async list(cursor?: string) {
    let before: { beforeDate: string; beforeId: string } | undefined;
    if (cursor) {
      try {
        before = z
          .object({
            beforeDate: z.string().datetime({ offset: true }),
            beforeId: z.string().uuid(),
          })
          .parse(JSON.parse(Buffer.from(cursor, 'base64url').toString()));
      } catch {
        throw new HistoryError('Invalid history page.', 400);
      }
    }
    const data = z
      .object({ items: z.array(chatThreadSchema).max(31) })
      .parse(await this.call('list', before ?? {}));
    const page = data.items.slice(0, 30);
    const last = page.at(-1);
    const organizer = await this.organizer();
    return {
      enabled: true,
      items: page.filter((item) => !item.requires_organizer || organizer),
      cursor:
        data.items.length > 30 && last
          ? Buffer.from(
              JSON.stringify({ beforeDate: last.last_message_at, beforeId: last.id }),
            ).toString('base64url')
          : null,
    };
  }

  async read(threadId: string, before?: number) {
    const data = z
      .object({
        thread: chatThreadSchema,
        messages: z.array(savedMessageSchema).max(41),
        context: archiveContextSchema,
        activeRun: z.string().uuid().nullable(),
      })
      .parse(await this.call('get', { threadId, before }));
    if (data.thread.requires_organizer && !(await this.organizer()))
      throw new HistoryError('This conversation is unavailable.', 404);
    const messages = data.messages.slice(-40);
    // Batch permission checks so a long conversation does not need one request
    // per answer. Filter prose and traces together with inaccessible cards.
    const results = messages.flatMap((message) =>
      message.payload.result ? [message.payload.result] : [],
    );
    const [talks, submissions, drafts, people] = await Promise.all([
      this.availableIds(
        'Talks',
        messages.flatMap((message) => message.payload.sources.map((source) => source.id)),
        true,
      ),
      this.availableIds(
        'organizer_talk_submissions',
        results.flatMap((result) =>
          result.kind === 'submissions' ? result.items.map((item) => item.id) : [],
        ),
      ),
      this.availableIds(
        'chat_event_drafts',
        results.flatMap((result) => (result.kind === 'event_draft' ? [result.draftId] : [])),
      ),
      this.availableIds(
        'People',
        results.flatMap((result) =>
          result.kind === 'ranking' ? result.rows.map((row) => row.id) : [],
        ),
      ),
    ]);
    for (const message of messages) {
      if (message.role !== 'assistant') continue;
      const result = message.payload.result;
      let visible = message.payload.sources.every((source) => talks.has(source.id));
      if (result?.kind === 'submissions')
        visible = visible && result.items.every((item) => submissions.has(item.id));
      if (result?.kind === 'event_draft') visible = visible && drafts.has(result.draftId);
      if (result?.kind === 'ranking')
        visible = visible && result.rows.every((row) => people.has(row.id));
      if (!visible) {
        message.text =
          'This answer is no longer available because access to its source records changed.';
        message.payload = savedMessagePayloadSchema.parse({});
        message.status = 'interrupted';
      }
    }
    const context = await this.validateContext(data.context);
    return {
      thread: data.thread,
      messages,
      before: data.messages.length > 40 ? messages[0].sequence : null,
      activeRun: data.activeRun,
      ...(context.eventDraftId ? { draftId: context.eventDraftId } : {}),
    };
  }

  private async availableIds(table: string, ids: string[], publishedTalks = false) {
    const unique = [...new Set(ids)],
      visible = new Set<string>();
    for (let offset = 0; offset < unique.length; offset += 100) {
      let query = this.caller
        .from(table)
        .select(publishedTalks ? 'id,event:Events!inner(public)' : 'id')
        .in('id', unique.slice(offset, offset + 100));
      if (publishedTalks) query = query.eq('event.public', true);
      const { data, error } = await query.abortSignal(AbortSignal.timeout(10000));
      if (error) throw new HistoryError('Source access could not be checked. Please retry.', 503);
      for (const row of z.array(z.object({ id: z.string().uuid() })).parse(data))
        visible.add(row.id);
    }
    return visible;
  }

  private async visibleIds(table: string, ids: string[]) {
    return (await this.availableIds(table, ids)).size === new Set(ids).size;
  }

  async validateContext(value: unknown): Promise<ArchiveContext> {
    const context = archiveContextSchema.parse(value);
    if (
      !(await this.visibleIds(
        'People',
        context.speakers.map((item) => item.id),
      ))
    ) {
      context.speakers = [];
      delete context.focusSpeakerId;
      delete context.lastQuery;
      delete context.nextOffset;
    }
    const eventIds = [
      ...new Set([
        ...context.events.map((item) => item.id),
        ...(context.lastQuery?.eventId ? [context.lastQuery.eventId] : []),
      ]),
    ];
    if (eventIds.length) {
      const { data, error } = await this.caller
        .from('Events')
        .select('id')
        .in('id', eventIds)
        .eq('public', true);
      if (error) throw new HistoryError('Event access could not be checked.', 503);
      if (data.length !== eventIds.length) {
        context.events = [];
        delete context.lastQuery;
        delete context.lastEventQuery;
        delete context.nextOffset;
      }
    }
    if (
      context.eventDraftId &&
      !(await this.visibleIds('chat_event_drafts', [context.eventDraftId]))
    )
      delete context.eventDraftId;
    if (
      context.submissions?.length &&
      !(await this.visibleIds(
        'organizer_talk_submissions',
        context.submissions.map((item) => item.id),
      ))
    ) {
      delete context.submissions;
      delete context.lastSubmissionQuery;
    }
    return context;
  }

  async begin(input: {
    threadId: string;
    runId: string;
    questionId: string;
    revision: number;
    question: string;
    budget: number;
  }) {
    // Inspect existing permission requirements before reserving quota or invoking tools.
    if (input.revision > 0) await this.read(input.threadId);
    const raw = await this.call('begin', input);
    const code = z.object({ code: z.string() }).parse(raw).code;
    if (code !== 'ok') return { code } as const;
    const data = z
      .object({
        code: z.literal('ok'),
        messageId: z.string().uuid(),
        revision: z.number().int(),
        context: archiveContextSchema,
        messages: z.array(z.object({ role: z.literal('user'), content: z.string() })),
      })
      .parse(raw);
    let remaining = 6000;
    const messages = data.messages
      .slice()
      .reverse()
      .filter((message) => {
        if (message.content.length > remaining) return false;
        remaining -= message.content.length;
        return true;
      })
      .reverse()
      .map((message) => ({ ...message, id: crypto.randomUUID() }));
    return { ...data, context: await this.validateContext(data.context), messages };
  }
}

/** One serialized writer per run; snapshots are bounded and never client-authored. */
export class HistoryWriter {
  text = '';
  payload: SavedMessagePayload = { version: 1, sources: [], activity: [] };
  context: ArchiveContext | undefined;
  private revision = 0;
  private queue: Promise<void> = Promise.resolve();
  private pending = false;
  private terminal = false;
  error: Error | undefined;
  constructor(
    private readonly history: ChatHistory,
    private readonly threadId: string,
    private readonly runId: string,
    private readonly cancel: () => void,
  ) {}

  checkpoint(status: 'running' | 'complete' | 'failed' | 'interrupted' = 'running', force = false) {
    if (this.terminal || (this.pending && status === 'running' && !force)) return this.queue;
    if (status !== 'running') this.terminal = true;
    this.pending = true;
    const snapshot = {
      threadId: this.threadId,
      runId: this.runId,
      checkpoint: ++this.revision,
      status,
      text: this.text.slice(0, 12000),
      payload: savedMessagePayloadSchema.parse(structuredClone(this.payload)),
      context: this.context ? structuredClone(this.context) : undefined,
      organizer:
        this.payload.result?.kind === 'submissions' ||
        this.payload.result?.kind === 'event_draft' ||
        this.payload.activity.some((step) =>
          /submission|draft|event_options|publish_event|attach_talk|update_event/.test(step.tool),
        ),
    };
    this.queue = this.queue.then(async () => {
      try {
        const response = z
          .object({ stopped: z.boolean() })
          .parse(await this.history.call('checkpoint', snapshot));
        if (response.stopped) this.cancel();
      } catch (error) {
        this.error = error instanceof Error ? error : new Error('History could not be saved.');
        this.cancel();
      } finally {
        this.pending = false;
      }
    });
    return this.queue;
  }
}

import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const status = z.enum([
  'initially_submitted',
  'approved',
  'assigned_to_event',
  'changes_requested',
  'rejected',
  'adjusted',
  'changes_submitted',
]);
const filterText = z
  .string()
  .trim()
  .max(160)
  .refine((value) => !value.includes('*'), 'Use words without * wildcards.')
  .default('');
export const submissionListSchema = z
  .object({
    title: filterText,
    speaker: filterText,
    status: z
      .union([status, z.literal('awaiting_review')])
      .nullish()
      .transform((value) => value ?? undefined),
    offset: z.number().int().min(0).max(10_000).default(0),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict();
export const submissionDetailSchema = z.object({ submissionId: z.string().uuid() }).strict();

const summary = z.object({
  id: z.string().uuid(),
  created_at: z.string(),
  status,
  talk_title: z.string(),
  speaker_name: z.string(),
  speaker_label: z.string().nullable(),
});
const detail = summary.extend({ talk_description: z.string(), slides_url: z.string() });
const columns = 'id,created_at,status,talk_title,speaker_name,speaker_label';
// Treat search input as a literal substring, not a PostgREST filter expression.
const literal = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export function createSubmissionTools(client: SupabaseClient, signal: AbortSignal) {
  async function authorize() {
    signal.throwIfAborted();
    for (const name of ['can_current_user_chat', 'can_current_user_manage_events']) {
      // manage_events delegates to the same permission helper as submission RLS.
      const { data, error } = await client.rpc(name).abortSignal(signal);
      if (error || data !== true) throw new Error('Organizer submission access is unavailable.');
    }
  }
  return {
    async list(input: z.input<typeof submissionListSchema>) {
      const args = submissionListSchema.parse(input);
      await authorize();
      let query = client.from('organizer_talk_submissions').select(columns);
      if (args.title) query = query.ilike('talk_title', `%${literal(args.title)}%`);
      if (args.speaker) query = query.ilike('speaker_name', `%${literal(args.speaker)}%`);
      if (args.status === 'awaiting_review')
        query = query.in('status', ['initially_submitted', 'adjusted', 'changes_submitted']);
      else if (args.status) query = query.eq('status', args.status);
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(args.offset, args.offset + args.limit)
        .abortSignal(signal);
      if (error) throw new Error('Talk submissions could not be read.');
      const rows = z
        .array(summary)
        .max(args.limit + 1)
        .parse(data);
      const hasMore = rows.length > args.limit;
      return {
        items: rows.slice(0, args.limit),
        hasMore,
        nextOffset: hasMore && args.offset + args.limit <= 10_000 ? args.offset + args.limit : null,
      };
    },
    async get(input: z.input<typeof submissionDetailSchema>) {
      const args = submissionDetailSchema.parse(input);
      await authorize();
      const { data, error } = await client
        .from('organizer_talk_submissions')
        .select(`${columns},talk_description,slides_url`)
        .eq('id', args.submissionId)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw new Error('Talk submission could not be read.');
      return { item: data === null ? null : detail.parse(data) };
    },
  };
}

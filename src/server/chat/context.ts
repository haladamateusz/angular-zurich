import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';

const archiveFiltersSchema = z.object({
  query: z.string().max(160).default(''),
  speakerId: z
    .string()
    .uuid()
    .refine((id) => id !== '00000000-0000-0000-0000-000000000000')
    .nullish()
    .transform((id) => id ?? undefined)
    .describe('Resolved speaker ID, or null for no speaker filter. Never invent an ID.'),
  eventId: z
    .string()
    .uuid()
    .refine((id) => id !== '00000000-0000-0000-0000-000000000000')
    .nullish()
    .transform((id) => id ?? undefined)
    .describe('Resolved event ID, or null for all events.'),
  fromYear: z
    .number()
    .int()
    .min(1990)
    .max(2100)
    .nullish()
    .transform((year) => year ?? undefined)
    .describe('Inclusive year bound, or null for no bound.'),
  toYear: z
    .number()
    .int()
    .min(1990)
    .max(2100)
    .nullish()
    .transform((year) => year ?? undefined)
    .describe('Inclusive year bound, or null for no bound.'),
  period: z.enum(['all', 'past', 'upcoming']).default('all'),
});
export const archiveQuerySchema = archiveFiltersSchema.extend({
  mode: z.enum(['talks', 'stats', 'ranking']).default('talks'),
  offset: z.number().int().min(0).max(200).default(0),
});
const entity = z.object({ id: z.string().uuid(), name: z.string().max(500) });
const archiveContextSchema = z.object({
  speakers: z.array(entity).max(10).default([]),
  events: z.array(entity).max(10).default([]),
  focusSpeakerId: z.string().uuid().optional(),
  lastQuery: archiveQuerySchema.optional(),
  nextOffset: z.number().int().min(0).max(200).optional(),
});
export type ArchiveContext = z.infer<typeof archiveContextSchema>;
const envelopeSchema = z.object({
  userId: z.string().uuid(),
  threadId: z.string().uuid(),
  expires: z.number(),
  context: archiveContextSchema,
});
const key = (secret: string) =>
  createHash('sha256').update('archive-context-v1\0').update(secret).digest();

// Server-issued, authenticated encryption keeps bounded context portable across
// serverless instances. No transcripts, secrets or authorization live in it.
export function sealContext(
  context: ArchiveContext,
  userId: string,
  threadId: string,
  secret: string,
) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), nonce);
  const payload = JSON.stringify(
    envelopeSchema.parse({
      userId,
      threadId,
      expires: Date.now() + 30 * 60_000,
      context: {
        ...context,
        speakers: context.speakers.map((p) => ({ ...p, name: p.name.slice(0, 80) })),
        events: context.events.map((p) => ({ ...p, name: p.name.slice(0, 80) })),
      },
    }),
  );
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function openContext(
  token: string | undefined,
  userId: string,
  threadId: string,
  secret: string,
): ArchiveContext {
  if (!token) return archiveContextSchema.parse({});
  try {
    if (token.length > 16_000) throw new Error();
    const bytes = Buffer.from(token, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(secret), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    const payload = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    const envelope = envelopeSchema.parse(JSON.parse(payload.toString()));
    if (envelope.userId !== userId || envelope.threadId !== threadId) throw new Error();
    if (envelope.expires <= Date.now()) return archiveContextSchema.parse({});
    return envelope.context;
  } catch {
    throw new Error('invalid_context');
  }
}

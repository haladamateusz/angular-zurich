import { z } from 'zod';

const years = z
  .array(
    z.object({
      year: z.number().int(),
      past: z.number().int().nonnegative(),
      upcoming: z.number().int().nonnegative(),
    }),
  )
  .max(111);
export const chatResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('talks'), total: z.number().int().nonnegative().optional() }),
  z.object({
    kind: z.literal('stats'),
    total: z.number().int().nonnegative(),
    past: z.number().int().nonnegative(),
    upcoming: z.number().int().nonnegative(),
    years,
  }),
  z.object({
    kind: z.literal('ranking'),
    rows: z
      .array(
        z.object({
          id: z.string().uuid(),
          name: z.string().max(500),
          talkCount: z.number().int().positive(),
          rank: z.number().int().positive(),
        }),
      )
      .max(10),
  }),
  z.object({ kind: z.literal('clarification') }),
  z.object({ kind: z.literal('no_results') }),
  z.object({ kind: z.literal('off_topic') }),
]);
export type ChatResult = z.infer<typeof chatResultSchema>;

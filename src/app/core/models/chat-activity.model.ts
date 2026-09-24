import { z } from 'zod';

export const chatActivitySchema = z.object({
  id: z.string().uuid(),
  tool: z.string().max(80),
  label: z.string().max(200),
  state: z.enum(['running', 'complete', 'failed', 'cancelled']),
  detail: z.string().max(500),
  durationMs: z.number().nonnegative().optional(),
});
export type ChatActivity = z.infer<typeof chatActivitySchema>;

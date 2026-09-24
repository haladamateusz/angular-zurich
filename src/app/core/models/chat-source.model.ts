import { z } from 'zod';
import { chatResultSchema } from './chat-result.model';

const chatSourceSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(500),
  speakers: z.array(z.string().max(300)).max(30),
  description: z.string().max(800),
  eventTitle: z.string().max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  url: z.string().regex(/^\/events\/[^/?#]+$/),
});
export const chatSourcesEventSchema = z.object({
  messageId: z.string().uuid(),
  result: chatResultSchema.optional(),
  sources: z.array(chatSourceSchema).max(10),
  summary: z.string().max(4000).optional(),
  nextQuestion: z.string().max(300).optional(),
});
export type ChatSource = z.infer<typeof chatSourceSchema>;

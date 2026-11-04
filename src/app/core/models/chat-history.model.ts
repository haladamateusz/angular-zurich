import { z } from 'zod';
import { chatActivitySchema } from './chat-activity.model';
import { chatSourcesEventSchema } from './chat-source.model';
import { chatResultSchema } from './chat-result.model';

export const chatThreadSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(100),
  revision: z.number().int().nonnegative(),
  last_message_at: z.string(),
  requires_organizer: z.boolean(),
});
export const savedMessagePayloadSchema = z.object({
  version: z.literal(1).default(1),
  sources: chatSourcesEventSchema.shape.sources.default([]),
  result: chatResultSchema.optional(),
  activity: z.array(chatActivitySchema).max(12).default([]),
  error: z.string().max(1000).optional(),
});
export const savedMessageSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().positive(),
  role: z.enum(['user', 'assistant']),
  text: z.string().max(12000),
  reply_to: z.string().uuid().nullable(),
  run_id: z.string().uuid(),
  status: z.enum(['running', 'complete', 'stopped', 'interrupted', 'failed']),
  payload: savedMessagePayloadSchema,
  created_at: z.string(),
});
export const historyPageSchema = z.object({
  thread: chatThreadSchema,
  messages: z.array(savedMessageSchema).max(40),
  before: z.number().int().positive().nullable(),
  activeRun: z.string().uuid().nullable(),
  draftId: z.string().uuid().optional(),
});
export const historyListSchema = z.object({
  enabled: z.boolean(),
  items: z.array(chatThreadSchema).max(30),
  cursor: z.string().nullable(),
});
export type ChatThread = z.infer<typeof chatThreadSchema>;
export type SavedMessage = z.infer<typeof savedMessageSchema>;
export type SavedMessagePayload = z.infer<typeof savedMessagePayloadSchema>;
export type HistoryPage = z.infer<typeof historyPageSchema>;

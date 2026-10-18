import { z } from 'zod';
import { chatResultSchema } from './chat-result.model';

const chatFeedbackRatingSchema = z.enum(['useful', 'not_quite']);
export type ChatFeedbackRating = z.infer<typeof chatFeedbackRatingSchema>;

export const chatFeedbackSchema = z
  .object({
    threadId: z.string().uuid(),
    messageId: z.string().uuid(),
    question: z.string().trim().min(1).max(2_000),
    answer: z.string().trim().min(1).max(12_000),
    sourceIds: z.array(z.string().uuid()).max(10),
    result: chatResultSchema.optional(),
    rating: chatFeedbackRatingSchema.nullable(),
  })
  .strict();

export type ChatFeedbackContext = Omit<z.infer<typeof chatFeedbackSchema>, 'rating'>;

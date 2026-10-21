import { z } from 'zod';

const optionalUrl = z.union([z.literal(''), z.string().url().startsWith('https://').max(1000)]);
export const eventDraftFieldsSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().max(4000),
  startsAt: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]),
  venueId: z.union([z.literal(''), z.string().uuid()]),
  meetupUrl: optionalUrl.refine((value) => value.length <= 500),
  imageUrl: optionalUrl,
});
const eventDraftTalkSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(3).max(160),
  description: z.string().min(1).max(5000),
  speakerIds: z.array(z.string().uuid()).min(1).max(5),
  sourceTalkId: z.string().uuid().nullable(),
});
export const eventDraftSchema = z.object({
  id: z.string().uuid(),
  created_by: z.string().uuid(),
  thread_id: z.string().uuid(),
  version: z.number().int().positive(),
  state: z.enum(['draft', 'saved', 'published', 'discarded']),
  content: eventDraftFieldsSchema.extend({ talks: z.array(eventDraftTalkSchema).max(3) }),
  event_id: z.string().uuid().nullable(),
  event_slug: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type EventDraft = z.infer<typeof eventDraftSchema>;
export const MEETUP_URL_PLACEHOLDER = 'https://www.meetup.com/angularzrh/events/placeholder/';
export interface EventDraftReview {
  draft: EventDraft;
  token: string | null;
  saveIssues: string[];
}
export function eventDraftSaveIssues(draft: EventDraft): string[] {
  const c = draft.content;
  const issues: string[] = [];
  if (!c.startsAt) issues.push('Select the event date and time.');
  if (!c.venueId) issues.push('Choose a venue.');
  if (!c.meetupUrl) issues.push('Add a Meetup URL or a placeholder link.');
  if (c.talks.length < 2) issues.push('Select at least two talks.');
  return issues;
}
export interface EventDraftOptions {
  venues: { id: string; title: string; street: string; city: string }[];
  speakers: { id: string; first_name: string | null; last_name: string | null }[];
  talks: { id: string; title: string; speakerNames: string[] }[];
}
export interface EventDraftAudit {
  id: string;
  actor_id: string;
  action: string;
  version: number;
  created_at: string;
}

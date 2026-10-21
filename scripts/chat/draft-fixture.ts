import { EventDraft } from '../../src/app/core/models/event-draft.model';
export const draftFixture: EventDraft = {
  id: '10000000-0000-4000-8000-000000000001',
  created_by: '9b0b6d9e-527f-44a0-a128-a3565783ca2a',
  thread_id: '10000000-0000-4000-8000-000000000002',
  version: 3,
  state: 'draft',
  event_id: null,
  event_slug: null,
  created_at: '2026-10-16T00:00:00Z',
  updated_at: '2026-10-16T00:00:00Z',
  content: {
    title: 'Agentic Angular meetup',
    startsAt: '2099-11-12T18:00',
    venueId: '10000000-0000-4000-8000-000000000003',
    meetupUrl: 'https://www.meetup.com/example/events/123/',
    imageUrl: '',
    talks: [1, 2].map((number) => ({
      id: `20000000-0000-4000-8000-00000000000${number}`,
      title: `Draft talk ${number}`,
      description: `Description for talk ${number}`,
      speakerIds: ['10000000-0000-4000-8000-000000000004'],
      sourceTalkId: null,
    })),
  },
};

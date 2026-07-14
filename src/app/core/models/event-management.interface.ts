export interface AssignableTalk {
  id: string;
  source_talk_submission_id: string;
  title: string;
  speaker_links: {
    speaker: {
      first_name: string | null;
      last_name: string | null;
    } | null;
  }[];
}

export interface VenueOption {
  id: string;
  title: string;
  street: string;
  city: string;
  zip: string;
}

export interface CreateEventPayload {
  title: string;
  startsAt: string;
  meetupUrl: string;
  venueId: string;
  talkIds: string[];
  featureGraphic: File;
  isPublic: boolean;
}

export interface UpdateEventPayload {
  eventId: string;
  title: string;
  startsAt: string;
  meetupUrl: string;
  venueId: string;
  talkIds: string[];
  featureGraphic: File | null;
  isPublic: boolean;
}

export interface CreateEventResult {
  id: string;
  slug: string;
  feature_graphic: string;
}

export interface UpdateEventResult {
  id: string;
  slug: string;
  feature_graphic: string | null;
}

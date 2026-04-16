export interface Event {
  id: string;
  title: string;
  meetup_url: string;
  starts_at: string;
  venue_id: string;
  talks: {
    id: string;
    title: string;
    description: string;
    event_id: string;
    presentation_time: number;
    created_by: string;
    speaker_links: {
      speaker: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        picture_url: string | null;
        label: string | null;
        company_name: string | null;
      } | null;
    }[];
  }[];
  venue: {
    title: string;
    street: string;
    city: string;
    zip: string;
    google_maps_url: string | null;
  } | null;
}

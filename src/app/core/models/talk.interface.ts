export interface Talk {
  id: string;
  title: string;
  description: string;
  event_id: string;
  presentation_time: number;
  created_by: string;
  event: {
    id: string;
    title: string;
    starts_at: string;
  }[];
  speaker_links: {
    speaker: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      slug: string;
      picture_url: string | null;
      personal_url: string | null;
      github_url: string | null;
      twitter_url: string | null;
      linkedin_url: string | null;
      abstract: string | null;
    }[];
  }[];
}

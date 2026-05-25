export type TalkSubmissionStatus = 'pending' | 'reviewing' | 'accepted' | 'rejected';

export interface OrganizerTalkSubmission {
  id: string;
  created_at: string;
  status: TalkSubmissionStatus;
  talk_title: string;
  speaker_name: string;
  speaker_label: string | null;
}

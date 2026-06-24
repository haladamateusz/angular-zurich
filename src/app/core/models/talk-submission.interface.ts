export interface TalkSubmissionPayload {
  talkTitle: string;
  talkDescription: string;
  slidesLink: string;
  speakerName: string;
  speakerLabel?: string;
  emailAddress: string;
  speakerBio: string;
  personalUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  speakerPicture: File | null;
  captchaToken?: string;
}

export interface TalkSubmissionResult {
  id: string | null;
  status: 'initially_submitted';
  editToken?: string;
}

export interface TalkSubmissionStatusSummary {
  id: string;
  created_at: string;
  status: TalkSubmissionStatus;
  talk_title: string;
  can_edit: boolean;
}

export type TalkSubmissionStatus =
  | 'initially_submitted'
  | 'approved'
  | 'assigned_to_event'
  | 'changes_requested'
  | 'rejected'
  | 'adjusted'
  | 'changes_submitted';

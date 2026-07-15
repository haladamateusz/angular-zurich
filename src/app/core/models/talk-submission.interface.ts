export interface TalkSubmissionPayload {
  talkTitle: string;
  talkDescription: string;
  slidesLink: string;
  speakerFirstName: string;
  speakerLastName: string;
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

export interface TalkSubmissionEditPayload extends TalkSubmissionPayload {
  editToken: string;
  submissionId: string;
}

export interface TalkSubmissionResult {
  id: string | null;
  status: 'initially_submitted';
  editToken?: string;
}

export interface TalkSubmissionEditResult {
  id: string;
  status: 'adjusted' | 'changes_submitted';
}

export interface TalkSubmissionStatusSummary {
  id: string;
  created_at: string;
  status: TalkSubmissionStatus;
  talk_title: string;
  can_edit: boolean;
}

export interface TalkSubmissionEditable {
  id: string;
  status: TalkSubmissionStatus;
  talk_title: string;
  talk_description: string;
  slides_url: string;
  speaker_first_name: string;
  speaker_last_name: string;
  speaker_label: string | null;
  speaker_email: string;
  speaker_bio: string;
  personal_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  speaker_picture_path: string | null;
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

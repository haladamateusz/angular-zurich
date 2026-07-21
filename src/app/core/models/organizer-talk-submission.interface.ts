import { TalkSubmissionStatus } from './talk-submission.interface';

export type TalkSubmissionReviewAction = 'approve' | 'request_changes' | 'reject';

export interface OrganizerTalkSubmission {
  id: string;
  created_at: string;
  status: TalkSubmissionStatus;
  talk_title: string;
  speaker_name: string;
  speaker_label: string | null;
  speaker_picture_path: string | null;
}

export interface OrganizerTalkSubmissionDetail extends OrganizerTalkSubmission {
  talk_description: string;
  slides_url: string;
  speaker_email: string;
  personal_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
}

export interface OrganizerTalkSubmissionStatusEvent {
  id: string;
  submission_id: string;
  created_at: string;
  from_status: TalkSubmissionStatus | null;
  to_status: TalkSubmissionStatus;
  action:
    | 'submitted'
    | 'adjusted'
    | 'changes_submitted'
    | 'approved'
    | 'assigned_to_event'
    | 'removed_from_event'
    | 'changes_requested'
    | 'rejected';
  actor_kind: 'speaker' | 'reviewer' | 'system';
  actor_first_name: string | null;
  actor_last_name: string | null;
  message: string | null;
}

export type { TalkSubmissionStatus };

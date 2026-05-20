export interface TalkSubmissionPayload {
  talkTitle: string;
  talkDescription: string;
  speakerName: string;
  emailAddress: string;
  speakerBio: string;
  speakerContactInfo: string;
  captchaToken?: string;
}

export interface TalkSubmissionResult {
  id: string | null;
  status: 'pending';
}

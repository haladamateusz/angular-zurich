export interface TalkSubmissionPayload {
  talkTitle: string;
  talkDescription: string;
  slidesLink?: string;
  speakerName: string;
  emailAddress: string;
  speakerBio: string;
  personalUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  speakerPicture?: File | null;
  captchaToken?: string;
}

export interface TalkSubmissionResult {
  id: string | null;
  status: 'pending';
}

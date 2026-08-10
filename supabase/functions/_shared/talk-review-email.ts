import { sendEmail } from './mail.ts';

const CANONICAL_SITE_URL = 'https://angular.zuerich';

export type TalkReviewEmailAction = 'approve' | 'request_changes' | 'reject';

export interface TalkReviewEmailContext {
  action: TalkReviewEmailAction;
  submissionId: string;
  talkTitle: string;
  speakerFirstName?: string | null;
  speakerName: string;
  speakerEmail: string;
  organizerMessage: string | null;
  siteUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getSubmissionStatusUrl(siteUrl: string, submissionId: string): string {
  return `${siteUrl.replace(/\/$/, '')}/talk-submission/${submissionId}`;
}

function getSpeakerGreetingName(speakerFirstName: string | null | undefined, speakerName: string): string {
  return speakerFirstName?.trim() || speakerName.trim();
}

function getEmailContent(context: TalkReviewEmailContext): {
  subject: string;
  text: string;
  html: string;
} {
  const talkTitle = context.talkTitle.trim();
  const speakerGreetingName = getSpeakerGreetingName(context.speakerFirstName, context.speakerName);
  const statusUrl = getSubmissionStatusUrl(context.siteUrl, context.submissionId);
  const organizerMessage = context.organizerMessage?.trim() ?? '';

  switch (context.action) {
    case 'approve':
      return {
        subject: 'Your Angular Zürich talk proposal was approved',
        text: [
          `Hi ${speakerGreetingName},`,
          '',
          `Good news: the organizers approved your talk proposal ${talkTitle}.`,
          '',
          'We will be in touch once your talk is assigned to an event and we have scheduling details to share.',
          '',
          `You can check the current status here: ${statusUrl}`,
          '',
          'Thanks again for submitting to Angular Zürich.',
        ].join('\n'),
        html: [
          `<p>Hi ${escapeHtml(speakerGreetingName)},</p>`,
          `<p>Good news: the organizers approved your talk proposal <strong>${escapeHtml(talkTitle)}</strong>.</p>`,
          '<p>We will be in touch once your talk is assigned to an event and we have scheduling details to share.</p>',
          `<p>You can check the current status <a href="${escapeHtml(statusUrl)}">here</a>.</p>`,
          '<p>Thanks again for submitting to Angular Zürich.</p>',
        ].join(''),
      };

    case 'request_changes':
      return {
        subject: 'Updates requested for your Angular Zürich talk proposal',
        text: [
          `Hi ${speakerGreetingName},`,
          '',
          `Thanks for submitting "${talkTitle}" to Angular Zürich.`,
          '',
          'The organizers reviewed your proposal and would like a few updates before making a final decision.',
          '',
          organizerMessage ? `Message from the organizers:\n${organizerMessage}` : '',
          '',
          `You can update your submission here: ${statusUrl}`,
          '',
          'Thanks again for working on this with us.',
        ]
          .filter((line) => line !== '')
          .join('\n'),
        html: [
          `<p>Hi ${escapeHtml(speakerGreetingName)},</p>`,
          `<p>Thanks for submitting <strong>${escapeHtml(talkTitle)}</strong> to Angular Zürich.</p>`,
          '<p>The organizers reviewed your proposal and would like a few updates before making a final decision.</p>',
          organizerMessage
            ? `<p><strong>Message from the organizers:</strong><br>${escapeHtml(organizerMessage).replaceAll('\n', '<br>')}</p>`
            : '',
          `<p>You can update your submission <a href="${escapeHtml(statusUrl)}">here</a>.</p>`,
          '<p>Thanks again for working on this with us.</p>',
        ].join(''),
      };

    case 'reject':
      return {
        subject: 'Update on your Angular Zürich talk proposal',
        text: [
          `Hi ${speakerGreetingName},`,
          '',
          `Thank you for submitting "${talkTitle}" to Angular Zürich.`,
          '',
          'After review, the organizers decided not to move forward with this proposal for an upcoming event.',
          '',
          organizerMessage ? `Message from the organizers:\n${organizerMessage}` : '',
          '',
          'We appreciate the time you put into the submission and hope you will share another idea with us in the future.',
        ]
          .filter((line) => line !== '')
          .join('\n'),
        html: [
          `<p>Hi ${escapeHtml(speakerGreetingName)},</p>`,
          `<p>Thank you for submitting <strong>${escapeHtml(talkTitle)}</strong> to Angular Zürich.</p>`,
          '<p>After review, the organizers decided not to move forward with this proposal for an upcoming event.</p>',
          organizerMessage
            ? `<p><strong>Message from the organizers:</strong><br>${escapeHtml(organizerMessage).replaceAll('\n', '<br>')}</p>`
            : '',
          '<p>We appreciate the time you put into the submission and hope you will share another idea with us in the future.</p>',
        ].join(''),
      };
  }
}

export function getSiteUrl(): string {
  const configuredSiteUrl = Deno.env.get('TALK_SUBMISSIONS_SITE_URL')?.trim();

  if (configuredSiteUrl) {
    return configuredSiteUrl.replace(/\/$/, '');
  }

  const allowedOrigins = Deno.env.get('TALK_SUBMISSIONS_ALLOWED_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0) ?? [];

  const canonicalOrigin = allowedOrigins.find(
    (origin) => origin === 'https://angular.zuerich' || origin === 'https://www.angular.zuerich',
  );

  if (canonicalOrigin) {
    return CANONICAL_SITE_URL;
  }

  const httpsOrigin = allowedOrigins.find((origin) => origin.startsWith('https://'));

  if (httpsOrigin) {
    return httpsOrigin.replace(/\/$/, '');
  }

  return CANONICAL_SITE_URL;
}

export async function sendTalkReviewEmail(context: TalkReviewEmailContext): Promise<void> {
  const speakerEmail = context.speakerEmail.trim().toLowerCase();

  if (!speakerEmail) {
    console.warn('talk-review-email skipped: speaker email is missing');
    return;
  }

  const siteUrl = context.siteUrl.trim();

  if (!siteUrl) {
    console.warn('talk-review-email skipped: site URL is not configured');
    return;
  }

  const { subject, text, html } = getEmailContent({
    ...context,
    siteUrl,
    speakerEmail,
  });

  await sendEmail({
    to: speakerEmail,
    subject,
    text,
    html,
  });
}

export interface TalkSubmissionReceivedEmailContext {
  submissionId: string;
  talkTitle: string;
  speakerFirstName?: string | null;
  speakerName: string;
  speakerEmail: string;
  siteUrl: string;
}

export async function sendTalkSubmissionReceivedEmail(
  context: TalkSubmissionReceivedEmailContext,
): Promise<void> {
  const speakerEmail = context.speakerEmail.trim().toLowerCase();
  const talkTitle = context.talkTitle.trim();
  const speakerGreetingName = getSpeakerGreetingName(context.speakerFirstName, context.speakerName);
  const siteUrl = context.siteUrl.trim();

  if (!speakerEmail) {
    console.warn('talk-submission-received-email skipped: speaker email is missing');
    return;
  }

  const statusUrl = getSubmissionStatusUrl(siteUrl, context.submissionId);
  const subject = 'We received your Angular Zürich talk proposal';
  const text = [
    `Hi ${speakerGreetingName},`,
    '',
    `Thanks for submitting "${talkTitle}" to Angular Zürich.`,
    '',
    'Your proposal is now in our review queue. The organizers will review it and follow up with the next step.',
    '',
    `You can check the current status here: ${statusUrl}`,
    '',
    'Thanks for sharing your idea with the Angular Zürich community.',
  ].join('\n');
  const html = [
    `<p>Hi ${escapeHtml(speakerGreetingName)},</p>`,
    `<p>Thanks for submitting <strong>${escapeHtml(talkTitle)}</strong> to Angular Zürich.</p>`,
    '<p>Your proposal is now in our review queue. The organizers will review it and follow up with the next step.</p>',
    `<p>You can check the current status <a href="${escapeHtml(statusUrl)}">here</a>.</p>`,
    '<p>Thanks for sharing your idea with the Angular Zürich community.</p>',
  ].join('');

  await sendEmail({
    to: speakerEmail,
    subject,
    text,
    html,
  });
}

export interface TalkSubmissionChangesReceivedEmailContext {
  submissionId: string;
  talkTitle: string;
  speakerFirstName?: string | null;
  speakerName: string;
  speakerEmail: string;
  siteUrl: string;
}

export async function sendTalkSubmissionChangesReceivedEmail(
  context: TalkSubmissionChangesReceivedEmailContext,
): Promise<void> {
  const speakerEmail = context.speakerEmail.trim().toLowerCase();
  const talkTitle = context.talkTitle.trim();
  const speakerGreetingName = getSpeakerGreetingName(context.speakerFirstName, context.speakerName);
  const siteUrl = context.siteUrl.trim();

  if (!speakerEmail) {
    console.warn('talk-submission-changes-received-email skipped: speaker email is missing');
    return;
  }

  const statusUrl = getSubmissionStatusUrl(siteUrl, context.submissionId);
  const subject = 'We received the changes to your Angular Zürich talk proposal';
  const text = [
    `Hi ${speakerGreetingName},`,
    '',
    `Thanks for updating "${talkTitle}" for Angular Zürich.`,
    '',
    'We received your changes and returned your proposal to our review queue. The organizers will review it and follow up with the next step.',
    '',
    `You can check the current status here: ${statusUrl}`,
    '',
    'Thanks again for working on this with us.',
  ].join('\n');
  const html = [
    `<p>Hi ${escapeHtml(speakerGreetingName)},</p>`,
    `<p>Thanks for updating <strong>${escapeHtml(talkTitle)}</strong> for Angular Zürich.</p>`,
    '<p>We received your changes and returned your proposal to our review queue. The organizers will review it and follow up with the next step.</p>',
    `<p>You can check the current status <a href="${escapeHtml(statusUrl)}">here</a>.</p>`,
    '<p>Thanks again for working on this with us.</p>',
  ].join('');

  await sendEmail({
    to: speakerEmail,
    subject,
    text,
    html,
  });
}

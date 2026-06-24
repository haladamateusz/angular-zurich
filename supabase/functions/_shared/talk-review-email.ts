import { sendEmail } from './mail.ts';

const CANONICAL_SITE_URL = 'https://angular.zuerich';

export type TalkReviewEmailAction = 'approve' | 'request_changes' | 'reject';

export interface TalkReviewEmailContext {
  action: TalkReviewEmailAction;
  submissionId: string;
  talkTitle: string;
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

function getEmailContent(context: TalkReviewEmailContext): {
  subject: string;
  text: string;
  html: string;
} {
  const talkTitle = context.talkTitle.trim();
  const speakerName = context.speakerName.trim();
  const statusUrl = getSubmissionStatusUrl(context.siteUrl, context.submissionId);
  const organizerMessage = context.organizerMessage?.trim() ?? '';

  switch (context.action) {
    case 'approve':
      return {
        subject: `Your talk proposal "${talkTitle}" was approved`,
        text: [
          `Hi ${speakerName},`,
          '',
          `Good news — the Angular Zurich organizers approved your talk proposal "${talkTitle}".`,
          '',
          'We will follow up with scheduling details when your talk is assigned to an event.',
          '',
          `You can check the current status here: ${statusUrl}`,
          '',
          'Thanks for submitting to Angular Zurich.',
        ].join('\n'),
        html: [
          `<p>Hi ${escapeHtml(speakerName)},</p>`,
          `<p>Good news — the Angular Zurich organizers approved your talk proposal <strong>${escapeHtml(talkTitle)}</strong>.</p>`,
          '<p>We will follow up with scheduling details when your talk is assigned to an event.</p>',
          `<p>You can check the current status <a href="${escapeHtml(statusUrl)}">on our website</a>.</p>`,
          '<p>Thanks for submitting to Angular Zurich.</p>',
        ].join(''),
      };

    case 'request_changes':
      return {
        subject: `Changes requested for your talk proposal "${talkTitle}"`,
        text: [
          `Hi ${speakerName},`,
          '',
          `The Angular Zurich organizers reviewed your talk proposal "${talkTitle}" and would like a few changes before we can approve it.`,
          '',
          organizerMessage ? `Message from the organizers:\n${organizerMessage}` : '',
          '',
          `Open the submission status page on the same browser you used to submit: ${statusUrl}`,
          '',
          'Thanks for submitting to Angular Zurich.',
        ]
          .filter((line) => line !== '')
          .join('\n'),
        html: [
          `<p>Hi ${escapeHtml(speakerName)},</p>`,
          `<p>The Angular Zurich organizers reviewed your talk proposal <strong>${escapeHtml(talkTitle)}</strong> and would like a few changes before we can approve it.</p>`,
          organizerMessage
            ? `<p><strong>Message from the organizers:</strong><br>${escapeHtml(organizerMessage).replaceAll('\n', '<br>')}</p>`
            : '',
          `<p>Open the <a href="${escapeHtml(statusUrl)}">submission status page</a> on the same browser you used to submit.</p>`,
          '<p>Thanks for submitting to Angular Zurich.</p>',
        ].join(''),
      };

    case 'reject':
      return {
        subject: `Update on your talk proposal "${talkTitle}"`,
        text: [
          `Hi ${speakerName},`,
          '',
          `Thank you for submitting "${talkTitle}" to Angular Zurich.`,
          '',
          'After review, we will not be moving forward with this proposal for an upcoming event.',
          '',
          organizerMessage ? `Message from the organizers:\n${organizerMessage}` : '',
          '',
          'We appreciate the time you put into the submission and hope to hear from you again.',
        ]
          .filter((line) => line !== '')
          .join('\n'),
        html: [
          `<p>Hi ${escapeHtml(speakerName)},</p>`,
          `<p>Thank you for submitting <strong>${escapeHtml(talkTitle)}</strong> to Angular Zurich.</p>`,
          '<p>After review, we will not be moving forward with this proposal for an upcoming event.</p>',
          organizerMessage
            ? `<p><strong>Message from the organizers:</strong><br>${escapeHtml(organizerMessage).replaceAll('\n', '<br>')}</p>`
            : '',
          '<p>We appreciate the time you put into the submission and hope to hear from you again.</p>',
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
  speakerName: string;
  speakerEmail: string;
  siteUrl: string;
}

export async function sendTalkSubmissionReceivedEmail(
  context: TalkSubmissionReceivedEmailContext,
): Promise<void> {
  const speakerEmail = context.speakerEmail.trim().toLowerCase();
  const talkTitle = context.talkTitle.trim();
  const speakerName = context.speakerName.trim();
  const siteUrl = context.siteUrl.trim();

  if (!speakerEmail) {
    console.warn('talk-submission-received-email skipped: speaker email is missing');
    return;
  }

  const statusUrl = getSubmissionStatusUrl(siteUrl, context.submissionId);
  const subject = `We received your talk proposal "${talkTitle}"`;
  const text = [
    `Hi ${speakerName},`,
    '',
    `Thanks for submitting "${talkTitle}" to Angular Zurich.`,
    '',
    'Your proposal is now in our review queue. We will reach out after the review, whether we move forward with the talk or not.',
    '',
    `You can check the current status on the same browser you used to submit: ${statusUrl}`,
    '',
    'Thanks for sharing your talk idea with the community.',
  ].join('\n');
  const html = [
    `<p>Hi ${escapeHtml(speakerName)},</p>`,
    `<p>Thanks for submitting <strong>${escapeHtml(talkTitle)}</strong> to Angular Zurich.</p>`,
    '<p>Your proposal is now in our review queue. We will reach out after the review, whether we move forward with the talk or not.</p>',
    `<p>You can check the current status on the <a href="${escapeHtml(statusUrl)}">same browser you used to submit</a>.</p>`,
    '<p>Thanks for sharing your talk idea with the community.</p>',
  ].join('');

  await sendEmail({
    to: speakerEmail,
    subject,
    text,
    html,
  });
}

import { sendEmail } from './mail.ts';

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

export function getSiteUrl(): string | null {
  const configuredSiteUrl = Deno.env.get('TALK_SUBMISSIONS_SITE_URL')?.trim();

  if (configuredSiteUrl) {
    return configuredSiteUrl;
  }

  const allowedOrigins = Deno.env.get('TALK_SUBMISSIONS_ALLOWED_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0) ?? [];

  return allowedOrigins.find((origin) => origin.startsWith('https://')) ?? allowedOrigins[0] ?? null;
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

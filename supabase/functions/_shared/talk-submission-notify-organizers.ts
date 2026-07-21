import { sendEmail } from './mail.ts';
import { getSiteUrl } from './talk-review-email.ts';

export interface TalkSubmissionOrganizerNotification {
  submissionId: string;
  talkTitle: string;
  speakerName: string;
  speakerEmail: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getDashboardUrl(siteUrl: string, submissionId: string): string {
  return `${siteUrl.replace(/\/$/, '')}/dashboard/talk-submissions/${submissionId}`;
}

function getEmailContent(context: TalkSubmissionOrganizerNotification): {
  subject: string;
  text: string;
  html: string;
} {
  const subject = `New Angular Zürich talk proposal: ${context.talkTitle.trim()}`;
  const dashboardUrl = getDashboardUrl(getSiteUrl(), context.submissionId);

  const speakerLine = context.speakerEmail.trim()
    ? `${context.speakerName.trim()} (${context.speakerEmail.trim()})`
    : context.speakerName.trim();

  const text = [
    `Hi,`,
    ``,
    `A new talk proposal was submitted and is ready for review.`,
    ``,
    `Talk: ${context.talkTitle.trim()}`,
    `Speaker: ${speakerLine}`,
    `Submission ID: ${context.submissionId}`,
    ``,
    `Review it in the dashboard: ${dashboardUrl}`,
    ``,
  ].join('\n');

  const html = [
    `<p>Hi,</p>`,
    `<p>A new talk proposal was submitted and is ready for review.</p>`,
    `<p><strong>Talk:</strong> ${escapeHtml(context.talkTitle.trim())}</p>`,
    `<p><strong>Speaker:</strong> ${escapeHtml(speakerLine)}</p>`,
    `<p><strong>Submission ID:</strong> ${escapeHtml(context.submissionId)}</p>`,
    `<p><strong>Review:</strong> <a href="${escapeHtml(dashboardUrl)}">${escapeHtml(
      dashboardUrl,
    )}</a></p>`,
  ].join('');

  return { subject, text, html };
}

export async function sendTalkSubmissionToOrganizersEmail(
  organizerEmail: string,
  context: TalkSubmissionOrganizerNotification,
): Promise<void> {
  const to = organizerEmail.trim().toLowerCase();

  if (!to) {
    console.warn('talk-submission-organizers-email skipped: organizer email is missing');
    return;
  }

  const { subject, text, html } = getEmailContent(context);

  await sendEmail({
    to,
    subject,
    text,
    html,
  });
}

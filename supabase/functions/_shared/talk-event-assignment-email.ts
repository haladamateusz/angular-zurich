import { sendEmail } from "./mail.ts";

export interface TalkEventAssignmentEmailContext {
  eventSlug: string;
  eventStartsAt: string;
  eventTitle: string;
  meetupUrl: string;
  siteUrl: string;
  speakerEmail: string;
  speakerFirstName?: string | null;
  speakerName: string;
  talkTitle: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatEventDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Zurich",
  }).format(new Date(value));
}

function getSpeakerGreetingName(speakerFirstName: string | null | undefined, speakerName: string): string {
  return speakerFirstName?.trim() || speakerName.trim();
}

export async function sendTalkEventAssignmentEmail(
  context: TalkEventAssignmentEmailContext,
): Promise<boolean> {
  const speakerEmail = context.speakerEmail.trim().toLowerCase();

  if (!speakerEmail) {
    console.warn(
      "talk-event-assignment-email skipped: speaker email is missing",
    );
    return false;
  }

  const speakerGreetingName = getSpeakerGreetingName(context.speakerFirstName, context.speakerName);
  const talkTitle = context.talkTitle.trim();
  const eventTitle = context.eventTitle.trim();
  const eventDate = formatEventDate(context.eventStartsAt);
  const eventUrl = `${
    context.siteUrl.replace(/\/$/, "")
  }/events/${context.eventSlug}`;
  const subject = `Your Angular Zurich talk is scheduled for ${eventTitle}`;
  const text = [
    `Hi ${speakerGreetingName},`,
    "",
    `Your talk ${talkTitle} is scheduled for ${eventTitle}.`,
    "",
    `Date: ${eventDate}`,
    `Event details: ${eventUrl}`,
    `Meetup: ${context.meetupUrl}`,
    "",
    "We are looking forward to having you at Angular Zurich.",
  ].join("\n");
  const html = [
    `<p>Hi ${escapeHtml(speakerGreetingName)},</p>`,
    `<p>Your talk <strong>${
      escapeHtml(talkTitle)
    }</strong> is scheduled for <strong>${
      escapeHtml(eventTitle)
    }</strong>.</p>`,
    `<p><strong>Date:</strong> ${escapeHtml(eventDate)}</p>`,
    `<p><a href="${escapeHtml(eventUrl)}">View event details</a><br><a href="${
      escapeHtml(context.meetupUrl)
    }">Open Meetup</a></p>`,
    "<p>We are looking forward to having you at Angular Zurich.</p>",
  ].join("");

  await sendEmail({
    to: speakerEmail,
    subject,
    text,
    html,
  });

  return true;
}

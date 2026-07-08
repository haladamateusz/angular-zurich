import '@supabase/functions-js/edge-runtime.d.ts';

import {
  sendTalkSubmissionToOrganizersEmail,
  type TalkSubmissionOrganizerNotification,
} from '../_shared/talk-submission-notify-organizers.ts';

type TalkSubmissionNotificationRequest = {
  submissionId?: string;
  talkTitle?: string;
  speakerName?: string;
  speakerEmail?: string;
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function getBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' });
  }

  const webhookSecret = Deno.env.get('TALK_SUBMISSIONS_NOTIFY_WEBHOOK_SECRET');

  if (!webhookSecret) {
    return jsonResponse(500, { error: 'notify_webhook_secret_missing' });
  }

  const token = getBearerToken(req.headers.get('authorization'));

  if (!token || token !== webhookSecret) {
    return jsonResponse(401, { error: 'unauthorized' });
  }

  let body: TalkSubmissionNotificationRequest;
  try {
    body = (await req.json()) as TalkSubmissionNotificationRequest;
  } catch {
    return jsonResponse(400, { error: 'invalid_json' });
  }

  const submissionId = body.submissionId?.trim();
  const talkTitle = body.talkTitle?.trim();
  const speakerName = body.speakerName?.trim();
  const speakerEmail = body.speakerEmail?.trim();

  if (!submissionId || !talkTitle || !speakerName) {
    return jsonResponse(400, { error: 'request_invalid' });
  }

  const context: TalkSubmissionOrganizerNotification = {
    submissionId,
    talkTitle,
    speakerName,
    speakerEmail: speakerEmail ?? '',
  };

  const tomaszEmail = Deno.env.get('TALK_SUBMISSIONS_NOTIFY_TOMASZ_EMAIL')?.trim() ?? '';
  const mateuszEmail = Deno.env.get('TALK_SUBMISSIONS_NOTIFY_MATEUSZ_EMAIL')?.trim() ?? '';

  const recipients = [tomaszEmail, mateuszEmail].filter((email) => email.length > 0);

  for (const recipient of recipients) {
    try {
      await sendTalkSubmissionToOrganizersEmail(recipient, context);
    } catch (error) {
      if (error instanceof Error) {
        console.error('talk-submission-organizers-email failed', error.message, error.stack);
      } else {
        console.error('talk-submission-organizers-email failed', error);
      }
    }
  }

  return jsonResponse(200, { ok: true });
});


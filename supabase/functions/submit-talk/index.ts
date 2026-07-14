import '@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.7';
import {
  getSiteUrl,
  sendTalkSubmissionReceivedEmail,
} from '../_shared/talk-review-email.ts';
import {
  sendTalkSubmissionToOrganizersEmail,
  type TalkSubmissionOrganizerNotification,
} from '../_shared/talk-submission-notify-organizers.ts';

type TalkSubmissionPayload = {
  talkTitle: string;
  talkDescription: string;
  slidesLink: string;
  speakerFirstName: string;
  speakerLastName: string;
  speakerName: string;
  speakerLabel?: string;
  emailAddress: string;
  speakerBio: string;
  personalUrl?: string;
  twitterUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  speakerPicture: File | null;
  captchaToken?: string;
};

type JsonRecord = Record<string, unknown>;

interface OrganizerNotificationResult {
  notified: number;
  failed: number;
}

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://angular.zuerich',
  'https://www.angular.zuerich',
];

const TALK_TITLE_MAX_LENGTH = 160;
const TALK_DESCRIPTION_MAX_LENGTH = 6000;
const SLIDES_LINK_MAX_LENGTH = 500;
const SPEAKER_NAME_MAX_LENGTH = 120;
const SPEAKER_FIRST_NAME_MAX_LENGTH = 60;
const SPEAKER_LAST_NAME_MAX_LENGTH = 59;
const SPEAKER_LABEL_MAX_LENGTH = 160;
const EMAIL_ADDRESS_MAX_LENGTH = 320;
const SPEAKER_BIO_MAX_LENGTH = 4000;
const PROFILE_URL_MAX_LENGTH = 500;
const SPEAKER_PICTURE_PATH_MAX_LENGTH = 1024;
const USER_AGENT_MAX_LENGTH = 512;
const ORIGIN_MAX_LENGTH = 255;

const IP_RATE_LIMIT_MAX = 5;
const EMAIL_RATE_LIMIT_MAX = 3;
const SPEAKER_PICTURE_BUCKET = 'talk-submission-assets';
const SPEAKER_PICTURE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const SPEAKER_PICTURE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const sql = postgres(Deno.env.get('TALK_SUBMISSIONS_DB_URL') ?? '', {
  prepare: false,
});

const SUPABASE_SECRET_KEYS = Deno.env.get('SUPABASE_SECRET_KEYS');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseServiceKey = getSupabaseServiceKey();

const supabaseAdmin = Deno.env.get('SUPABASE_URL') && supabaseServiceKey
  ? createClient(Deno.env.get('SUPABASE_URL')!, supabaseServiceKey)
  : null;

function getSupabaseServiceKey(): string | undefined {
  if (!SUPABASE_SECRET_KEYS) {
    return SUPABASE_SERVICE_ROLE_KEY || undefined;
  }

  try {
    return (JSON.parse(SUPABASE_SECRET_KEYS) as Record<string, string>)
      .default ?? SUPABASE_SERVICE_ROLE_KEY ?? undefined;
  } catch (error) {
    if (error instanceof Error) {
      console.error('supabase-secret-keys parse failed', error.message);
    } else {
      console.error('supabase-secret-keys parse failed', error);
    }

    return SUPABASE_SERVICE_ROLE_KEY || undefined;
  }
}

async function getActiveOrganizerEmails(): Promise<string[]> {
  const rows = await sql<{ email: string }[]>`
    select email
    from private.allowed_google_accounts
    where active = true
    order by email
  `;

  return rows.map((row) => row.email);
}

async function notifyOrganizers(
  context: TalkSubmissionOrganizerNotification,
): Promise<OrganizerNotificationResult> {
  const recipients = await getActiveOrganizerEmails();
  let notified = 0;
  let failed = 0;

  if (recipients.length === 0) {
    console.warn('talk-submission-organizers-email skipped: no active organizer emails found');
    return { notified, failed };
  }

  for (const recipient of recipients) {
    try {
      await sendTalkSubmissionToOrganizersEmail(recipient, context);
      notified += 1;
    } catch (error) {
      failed += 1;

      if (error instanceof Error) {
        console.error('talk-submission-organizers-email failed', error.message, error.stack);
      } else {
        console.error('talk-submission-organizers-email failed', error);
      }
    }
  }

  return { notified, failed };
}

function jsonResponse(
  status: number,
  body: JsonRecord,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

function getAllowedOrigins(): string[] {
  const configured = Deno.env.get('TALK_SUBMISSIONS_ALLOWED_ORIGINS');

  if (!configured) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function getCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigins = getAllowedOrigins();
  const accessControlAllowOrigin =
    origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? '*';

  return {
    'Access-Control-Allow-Origin': accessControlAllowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function ensureAllowedOrigin(origin: string | null): Response | null {
  if (!origin) {
    return null;
  }

  if (getAllowedOrigins().includes(origin)) {
    return null;
  }

  return jsonResponse(
    403,
    { error: 'origin_not_allowed' },
    getCorsHeaders(origin),
  );
}

function normalizeText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeOptionalUrl(value: string | undefined, maxLength: number): string | null {
  const trimmed = (value ?? '').trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

function normalizeOptionalText(value: string | undefined, maxLength: number): string | null {
  const trimmed = (value ?? '').trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.replace(/\s+/g, ' ').slice(0, maxLength);
}

function normalizeOptionalFile(file: File | null | undefined): File | null {
  if (!file || file.size === 0) {
    return null;
  }

  return file;
}

function getSpeakerDisplayName(firstName: string, lastName: string): string {
  return [firstName, lastName].filter((name) => name.length > 0).join(' ');
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function hasValidSpeakerPictureType(file: File): boolean {
  return SPEAKER_PICTURE_ALLOWED_TYPES.includes(
    file.type as (typeof SPEAKER_PICTURE_ALLOWED_TYPES)[number],
  );
}

function getSpeakerPictureExtension(file: File): string {
  switch (file.type) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

async function parseSubmissionPayload(req: Request): Promise<TalkSubmissionPayload> {
  const contentType = req.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData();
    const speakerPictureField = formData.get('speakerPicture');

    return {
      talkTitle: String(formData.get('talkTitle') ?? ''),
      talkDescription: String(formData.get('talkDescription') ?? ''),
      slidesLink: String(formData.get('slidesLink') ?? ''),
      speakerFirstName: String(formData.get('speakerFirstName') ?? ''),
      speakerLastName: String(formData.get('speakerLastName') ?? ''),
      speakerName: String(formData.get('speakerName') ?? ''),
      speakerLabel: String(formData.get('speakerLabel') ?? '') || undefined,
      emailAddress: String(formData.get('emailAddress') ?? ''),
      speakerBio: String(formData.get('speakerBio') ?? ''),
      personalUrl: String(formData.get('personalUrl') ?? '') || undefined,
      twitterUrl: String(formData.get('twitterUrl') ?? '') || undefined,
      linkedinUrl: String(formData.get('linkedinUrl') ?? '') || undefined,
      githubUrl: String(formData.get('githubUrl') ?? '') || undefined,
      speakerPicture: speakerPictureField instanceof File ? speakerPictureField : null,
      captchaToken: String(formData.get('captchaToken') ?? '') || undefined,
    };
  }

  return await req.json() as TalkSubmissionPayload;
}

function extractIpAddress(req: Request): string | null {
  const forwardedFor = req.headers.get('x-forwarded-for');

  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }

  return (
    req.headers.get('cf-connecting-ip')?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || null
  );
}

async function sha256(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

function createEditToken(): string {
  const bytes = new Uint8Array(32);

  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function floorTo15MinuteBucket(date: Date): Date {
  const bucket = new Date(date);

  bucket.setUTCMinutes(Math.floor(bucket.getUTCMinutes() / 15) * 15, 0, 0);
  return bucket;
}

function floorToDayBucket(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

async function verifyCaptchaToken(
  captchaToken: string | undefined,
  ipAddress: string | null,
): Promise<boolean> {
  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY');

  if (!turnstileSecret) {
    return true;
  }

  if (!captchaToken) {
    return false;
  }

  const formData = new FormData();

  formData.set('secret', turnstileSecret);
  formData.set('response', captchaToken);

  if (ipAddress) {
    formData.set('remoteip', ipAddress);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    return false;
  }

  const result = (await response.json()) as { success?: boolean };

  return result.success === true;
}

async function enforceRateLimit(
  scope: 'ip_15m' | 'email_1d',
  keyHash: string,
  windowBucket: Date,
  maxCount: number,
): Promise<boolean> {
  const rows = await sql<{ request_count: number }[]>`
    insert into submissions.talk_submission_rate_limits (
      scope,
      key_hash,
      window_bucket,
      request_count,
      last_seen_at
    )
    values (
      ${scope},
      ${keyHash},
      ${windowBucket.toISOString()}::timestamptz,
      1,
      now()
    )
    on conflict (scope, key_hash, window_bucket)
    do update
      set request_count = submissions.talk_submission_rate_limits.request_count + 1,
          last_seen_at = now()
    returning request_count
  `;

  return (rows[0]?.request_count ?? 0) <= maxCount;
}

function validatePayload(payload: TalkSubmissionPayload): string | null {
  if (!payload.talkTitle || payload.talkTitle.trim().length < 5) {
    return 'talk_title_invalid';
  }

  if (!payload.talkDescription || payload.talkDescription.trim().length < 40) {
    return 'talk_description_invalid';
  }

  if (!payload.slidesLink || !isValidHttpUrl(payload.slidesLink)) {
    return 'slides_link_invalid';
  }

  if (!payload.speakerFirstName || payload.speakerFirstName.trim().length < 2) {
    return 'speaker_first_name_invalid';
  }

  if (!payload.speakerLastName || payload.speakerLastName.trim().length < 2) {
    return 'speaker_last_name_invalid';
  }

  if (!payload.emailAddress || !isValidEmail(payload.emailAddress.trim())) {
    return 'email_address_invalid';
  }

  if (!payload.speakerBio || payload.speakerBio.trim().length < 20) {
    return 'speaker_bio_invalid';
  }

  if (
    (payload.personalUrl && !isValidHttpUrl(payload.personalUrl))
    || (payload.twitterUrl && !isValidHttpUrl(payload.twitterUrl))
    || (payload.linkedinUrl && !isValidHttpUrl(payload.linkedinUrl))
    || (payload.githubUrl && !isValidHttpUrl(payload.githubUrl))
  ) {
    return 'speaker_profile_url_invalid';
  }

  if (!payload.speakerPicture) {
    return 'speaker_picture_required';
  }

  if (!hasValidSpeakerPictureType(payload.speakerPicture)) {
    return 'speaker_picture_invalid_type';
  }

  if (payload.speakerPicture.size > SPEAKER_PICTURE_MAX_SIZE_BYTES) {
    return 'speaker_picture_too_large';
  }

  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  const originError = ensureAllowedOrigin(origin);

  if (originError) {
    return originError;
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' }, corsHeaders);
  }

  try {
    const payload = await parseSubmissionPayload(req);
    const normalizedPayload: TalkSubmissionPayload = {
      talkTitle: normalizeText(payload.talkTitle ?? '', TALK_TITLE_MAX_LENGTH),
      talkDescription: normalizeText(payload.talkDescription ?? '', TALK_DESCRIPTION_MAX_LENGTH),
      slidesLink: normalizeOptionalUrl(payload.slidesLink, SLIDES_LINK_MAX_LENGTH) ?? '',
      speakerFirstName: normalizeText(payload.speakerFirstName ?? '', SPEAKER_FIRST_NAME_MAX_LENGTH),
      speakerLastName: normalizeText(payload.speakerLastName ?? '', SPEAKER_LAST_NAME_MAX_LENGTH),
      speakerName: '',
      speakerLabel: normalizeOptionalText(payload.speakerLabel, SPEAKER_LABEL_MAX_LENGTH) ?? undefined,
      emailAddress: normalizeText(payload.emailAddress ?? '', EMAIL_ADDRESS_MAX_LENGTH).toLowerCase(),
      speakerBio: normalizeText(payload.speakerBio ?? '', SPEAKER_BIO_MAX_LENGTH),
      personalUrl: normalizeOptionalUrl(payload.personalUrl, PROFILE_URL_MAX_LENGTH) ?? undefined,
      twitterUrl: normalizeOptionalUrl(payload.twitterUrl, PROFILE_URL_MAX_LENGTH) ?? undefined,
      linkedinUrl: normalizeOptionalUrl(payload.linkedinUrl, PROFILE_URL_MAX_LENGTH) ?? undefined,
      githubUrl: normalizeOptionalUrl(payload.githubUrl, PROFILE_URL_MAX_LENGTH) ?? undefined,
      speakerPicture: normalizeOptionalFile(payload.speakerPicture),
      captchaToken: payload.captchaToken,
    };
    normalizedPayload.speakerName = getSpeakerDisplayName(
      normalizedPayload.speakerFirstName,
      normalizedPayload.speakerLastName,
    ).slice(0, SPEAKER_NAME_MAX_LENGTH);

    const validationError = validatePayload(normalizedPayload);

    if (validationError) {
      return jsonResponse(400, { error: validationError }, corsHeaders);
    }

    const ipAddress = extractIpAddress(req);
    const captchaValid = await verifyCaptchaToken(normalizedPayload.captchaToken, ipAddress);

    if (!captchaValid) {
      return jsonResponse(400, { error: 'captcha_invalid' }, corsHeaders);
    }

    const now = new Date();
    const emailHash = await sha256(normalizedPayload.emailAddress);
    const ipHash = ipAddress ? await sha256(ipAddress) : null;

    if (ipHash) {
      const ipAllowed = await enforceRateLimit(
        'ip_15m',
        ipHash,
        floorTo15MinuteBucket(now),
        IP_RATE_LIMIT_MAX,
      );

      if (!ipAllowed) {
        return jsonResponse(429, { error: 'rate_limit_exceeded' }, corsHeaders);
      }
    }

    const emailAllowed = await enforceRateLimit(
      'email_1d',
      emailHash,
      floorToDayBucket(now),
      EMAIL_RATE_LIMIT_MAX,
    );

    if (!emailAllowed) {
      return jsonResponse(429, { error: 'rate_limit_exceeded' }, corsHeaders);
    }

    const submissionId = crypto.randomUUID();
    const editToken = createEditToken();
    const editTokenHash = await sha256(editToken);
    let speakerPicturePath: string | null = null;

    if (normalizedPayload.speakerPicture) {
      if (!supabaseAdmin) {
        console.error('submit-talk storage client is not configured');

        return jsonResponse(500, { error: 'storage_not_configured' }, corsHeaders);
      }

      const speakerPictureExtension = getSpeakerPictureExtension(normalizedPayload.speakerPicture);
      const nowDateSegment = now.toISOString().slice(0, 10);

      speakerPicturePath = [
        'speaker-pictures',
        nowDateSegment,
        `${submissionId}.${speakerPictureExtension}`,
      ].join('/');

      if (speakerPicturePath.length > SPEAKER_PICTURE_PATH_MAX_LENGTH) {
        return jsonResponse(400, { error: 'speaker_picture_path_invalid' }, corsHeaders);
      }

      const uploadResult = await supabaseAdmin.storage
        .from(SPEAKER_PICTURE_BUCKET)
        .upload(
          speakerPicturePath,
          new Uint8Array(await normalizedPayload.speakerPicture.arrayBuffer()),
          {
            contentType: normalizedPayload.speakerPicture.type,
            cacheControl: '3600',
            upsert: false,
          },
        );

      if (uploadResult.error) {
        console.error('submit-talk speaker picture upload failed', uploadResult.error);

        return jsonResponse(500, { error: 'speaker_picture_upload_failed' }, corsHeaders);
      }
    }

    const rows = await sql<{ id: string }[]>`
      insert into submissions.talk_submissions (
        id,
        talk_title,
        talk_description,
        slides_url,
        speaker_first_name,
        speaker_last_name,
        speaker_name,
        speaker_label,
        speaker_email,
        speaker_bio,
        personal_url,
        twitter_url,
        linkedin_url,
        github_url,
        speaker_picture_path,
        source_ip_hash,
        email_hash,
        user_agent,
        origin,
        edit_token_hash
      )
      values (
        ${submissionId}::uuid,
        ${normalizedPayload.talkTitle},
        ${normalizedPayload.talkDescription},
        ${normalizedPayload.slidesLink ?? null},
        ${normalizedPayload.speakerFirstName},
        ${normalizedPayload.speakerLastName},
        ${normalizedPayload.speakerName},
        ${normalizedPayload.speakerLabel ?? null},
        ${normalizedPayload.emailAddress},
        ${normalizedPayload.speakerBio},
        ${normalizedPayload.personalUrl ?? null},
        ${normalizedPayload.twitterUrl ?? null},
        ${normalizedPayload.linkedinUrl ?? null},
        ${normalizedPayload.githubUrl ?? null},
        ${speakerPicturePath},
        ${ipHash},
        ${emailHash},
        ${req.headers.get('user-agent')?.slice(0, USER_AGENT_MAX_LENGTH) ?? null},
        ${origin?.slice(0, ORIGIN_MAX_LENGTH) ?? null},
        ${editTokenHash}
      )
      returning id
    `;

    try {
      await sendTalkSubmissionReceivedEmail({
        submissionId,
        talkTitle: normalizedPayload.talkTitle,
        speakerFirstName: normalizedPayload.speakerFirstName,
        speakerName: normalizedPayload.speakerName,
        speakerEmail: normalizedPayload.emailAddress,
        siteUrl: getSiteUrl(),
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error('talk-submission-received-email failed', error.message, error.stack);
      } else {
        console.error('talk-submission-received-email failed', error);
      }
    }

    try {
      const organizerNotificationResult = await notifyOrganizers({
        submissionId,
        talkTitle: normalizedPayload.talkTitle,
        speakerName: normalizedPayload.speakerName,
        speakerEmail: normalizedPayload.emailAddress,
      });

      if (organizerNotificationResult.failed > 0) {
        console.error(
          'talk-submission-organizers-notify partially failed',
          organizerNotificationResult,
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error('talk-submission-organizers-notify failed', error.message, error.stack);
      } else {
        console.error('talk-submission-organizers-notify failed', error);
      }
    }

    return jsonResponse(
      201,
      {
        id: rows[0]?.id ?? null,
        status: 'initially_submitted',
        editToken,
      },
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error('submit-talk failed', error.message, error.stack);
    } else {
      console.error('submit-talk failed', error);
    }

    return jsonResponse(500, { error: 'internal_error' }, corsHeaders);
  }
});

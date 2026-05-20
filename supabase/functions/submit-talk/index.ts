import '@supabase/functions-js/edge-runtime.d.ts';
import postgres from 'npm:postgres@3.4.7';

type TalkSubmissionPayload = {
  talkTitle: string;
  talkDescription: string;
  slidesLink?: string;
  speakerName: string;
  emailAddress: string;
  speakerBio: string;
  speakerContactInfo: string;
  captchaToken?: string;
};

type JsonRecord = Record<string, unknown>;

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://angularzurich.dev',
  'https://www.angularzurich.dev',
];

const TALK_TITLE_MAX_LENGTH = 160;
const TALK_DESCRIPTION_MAX_LENGTH = 6000;
const SLIDES_LINK_MAX_LENGTH = 500;
const SPEAKER_NAME_MAX_LENGTH = 120;
const EMAIL_ADDRESS_MAX_LENGTH = 320;
const SPEAKER_BIO_MAX_LENGTH = 4000;
const SPEAKER_CONTACT_INFO_MAX_LENGTH = 1000;
const USER_AGENT_MAX_LENGTH = 512;
const ORIGIN_MAX_LENGTH = 255;

const IP_RATE_LIMIT_MAX = 5;
const EMAIL_RATE_LIMIT_MAX = 3;

const sql = postgres(Deno.env.get('TALK_SUBMISSIONS_DB_URL') ?? '', {
  prepare: false,
});

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

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
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

  if (payload.slidesLink && !isValidHttpUrl(payload.slidesLink)) {
    return 'slides_link_invalid';
  }

  if (!payload.speakerName || payload.speakerName.trim().length < 2) {
    return 'speaker_name_invalid';
  }

  if (!payload.emailAddress || !isValidEmail(payload.emailAddress.trim())) {
    return 'email_address_invalid';
  }

  if (!payload.speakerBio || payload.speakerBio.trim().length < 20) {
    return 'speaker_bio_invalid';
  }

  if (!payload.speakerContactInfo || payload.speakerContactInfo.trim().length < 5) {
    return 'speaker_contact_info_invalid';
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
    const payload = (await req.json()) as Partial<TalkSubmissionPayload>;
    const normalizedPayload: TalkSubmissionPayload = {
      talkTitle: normalizeText(payload.talkTitle ?? '', TALK_TITLE_MAX_LENGTH),
      talkDescription: normalizeText(payload.talkDescription ?? '', TALK_DESCRIPTION_MAX_LENGTH),
      slidesLink: normalizeOptionalUrl(payload.slidesLink, SLIDES_LINK_MAX_LENGTH) ?? undefined,
      speakerName: normalizeText(payload.speakerName ?? '', SPEAKER_NAME_MAX_LENGTH),
      emailAddress: normalizeText(payload.emailAddress ?? '', EMAIL_ADDRESS_MAX_LENGTH).toLowerCase(),
      speakerBio: normalizeText(payload.speakerBio ?? '', SPEAKER_BIO_MAX_LENGTH),
      speakerContactInfo: normalizeText(
        payload.speakerContactInfo ?? '',
        SPEAKER_CONTACT_INFO_MAX_LENGTH,
      ),
      captchaToken: payload.captchaToken,
    };

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

    const rows = await sql<{ id: string }[]>`
      insert into submissions.talk_submissions (
        talk_title,
        talk_description,
        slides_url,
        speaker_name,
        speaker_email,
        speaker_bio,
        speaker_contact_info,
        source_ip_hash,
        email_hash,
        user_agent,
        origin
      )
      values (
        ${normalizedPayload.talkTitle},
        ${normalizedPayload.talkDescription},
        ${normalizedPayload.slidesLink ?? null},
        ${normalizedPayload.speakerName},
        ${normalizedPayload.emailAddress},
        ${normalizedPayload.speakerBio},
        ${normalizedPayload.speakerContactInfo},
        ${ipHash},
        ${emailHash},
        ${req.headers.get('user-agent')?.slice(0, USER_AGENT_MAX_LENGTH) ?? null},
        ${origin?.slice(0, ORIGIN_MAX_LENGTH) ?? null}
      )
      returning id
    `;

    return jsonResponse(
      201,
      {
        id: rows[0]?.id ?? null,
        status: 'pending',
      },
      corsHeaders,
    );
  } catch (error) {
    console.error('submit-talk failed', error);

    return jsonResponse(500, { error: 'internal_error' }, corsHeaders);
  }
});

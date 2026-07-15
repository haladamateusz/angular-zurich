import '@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import postgres from 'npm:postgres@3.4.7';

interface TalkSubmissionUpdatePayload {
  submissionId: string;
  editToken: string;
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
}

interface EditableSubmission {
  id: string;
  status: 'initially_submitted' | 'adjusted' | 'changes_requested';
  speaker_picture_path: string | null;
}

interface UpdateResult {
  id: string;
  status: 'adjusted' | 'changes_submitted';
}

type JsonRecord = Record<string, unknown>;

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
const SPEAKER_PICTURE_BUCKET = 'talk-submission-assets';
const SPEAKER_PICTURE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const SPEAKER_PICTURE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const EDIT_IP_RATE_LIMIT_MAX = 30;
const EDIT_TOKEN_RATE_LIMIT_MAX = 10;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPABASE_SECRET_KEYS = Deno.env.get('SUPABASE_SECRET_KEYS');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const DATABASE_URL = Deno.env.get('TALK_SUBMISSIONS_DB_URL') ?? '';
const supabaseServiceKey = getSupabaseServiceKey();
const supabaseAdmin = SUPABASE_URL && supabaseServiceKey
  ? createClient(SUPABASE_URL, supabaseServiceKey)
  : null;
const sql = postgres(DATABASE_URL, { prepare: false });

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
  if (!origin || getAllowedOrigins().includes(origin)) {
    return null;
  }

  return jsonResponse(403, { error: 'origin_not_allowed' }, getCorsHeaders(origin));
}

function normalizeText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
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

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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

async function parseUpdatePayload(req: Request): Promise<TalkSubmissionUpdatePayload> {
  const formData = await req.formData();
  const speakerPictureField = formData.get('speakerPicture');

  return {
    submissionId: String(formData.get('submissionId') ?? ''),
    editToken: String(formData.get('editToken') ?? ''),
    talkTitle: String(formData.get('talkTitle') ?? ''),
    talkDescription: String(formData.get('talkDescription') ?? ''),
    slidesLink: String(formData.get('slidesLink') ?? ''),
    speakerFirstName: String(formData.get('speakerFirstName') ?? ''),
    speakerLastName: String(formData.get('speakerLastName') ?? ''),
    speakerName: '',
    speakerLabel: String(formData.get('speakerLabel') ?? '') || undefined,
    emailAddress: String(formData.get('emailAddress') ?? ''),
    speakerBio: String(formData.get('speakerBio') ?? ''),
    personalUrl: String(formData.get('personalUrl') ?? '') || undefined,
    twitterUrl: String(formData.get('twitterUrl') ?? '') || undefined,
    linkedinUrl: String(formData.get('linkedinUrl') ?? '') || undefined,
    githubUrl: String(formData.get('githubUrl') ?? '') || undefined,
    speakerPicture: speakerPictureField instanceof File ? speakerPictureField : null,
  };
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

async function enforceRateLimit(
  scope: 'edit_ip_15m' | 'edit_token_15m',
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

function validatePayload(payload: TalkSubmissionUpdatePayload): string | null {
  if (!UUID_PATTERN.test(payload.submissionId)) {
    return 'submission_id_invalid';
  }

  if (!payload.editToken.trim()) {
    return 'edit_token_invalid';
  }

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

  if (payload.speakerPicture && !hasValidSpeakerPictureType(payload.speakerPicture)) {
    return 'speaker_picture_invalid_type';
  }

  if (payload.speakerPicture && payload.speakerPicture.size > SPEAKER_PICTURE_MAX_SIZE_BYTES) {
    return 'speaker_picture_too_large';
  }

  return null;
}

async function getEditableSubmission(
  submissionId: string,
  editTokenHash: string,
): Promise<EditableSubmission | null> {
  const rows = await sql<EditableSubmission[]>`
    select id, status, speaker_picture_path
    from submissions.talk_submissions
    where id = ${submissionId}::uuid
      and edit_token_hash = ${editTokenHash}
      and status in (
        'initially_submitted'::submissions.talk_submission_status,
        'adjusted'::submissions.talk_submission_status,
        'changes_requested'::submissions.talk_submission_status
      )
    limit 1
  `;

  return rows[0] ?? null;
}

async function uploadSpeakerPicture(
  submissionId: string,
  speakerPicture: File,
): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('storage_not_configured');
  }

  const speakerPictureExtension = getSpeakerPictureExtension(speakerPicture);
  const now = new Date();
  const nowDateSegment = now.toISOString().slice(0, 10);
  const speakerPicturePath = [
    'submissions',
    nowDateSegment,
    `${submissionId}-${now.getTime()}.${speakerPictureExtension}`,
  ].join('/');

  if (speakerPicturePath.length > SPEAKER_PICTURE_PATH_MAX_LENGTH) {
    throw new Error('speaker_picture_path_invalid');
  }

  const uploadResult = await supabaseAdmin.storage
    .from(SPEAKER_PICTURE_BUCKET)
    .upload(
      speakerPicturePath,
      new Uint8Array(await speakerPicture.arrayBuffer()),
      {
        contentType: speakerPicture.type,
        cacheControl: '3600',
        upsert: false,
      },
    );

  if (uploadResult.error) {
    console.error('update-talk-submission speaker picture upload failed', uploadResult.error);
    throw new Error('speaker_picture_upload_failed');
  }

  return speakerPicturePath;
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

  if (!DATABASE_URL) {
    return jsonResponse(500, { error: 'database_not_configured' }, corsHeaders);
  }

  try {
    const payload = await parseUpdatePayload(req);
    const normalizedPayload: TalkSubmissionUpdatePayload = {
      submissionId: payload.submissionId.trim(),
      editToken: payload.editToken.trim(),
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
    };
    normalizedPayload.speakerName = getSpeakerDisplayName(
      normalizedPayload.speakerFirstName,
      normalizedPayload.speakerLastName,
    ).slice(0, SPEAKER_NAME_MAX_LENGTH);

    const validationError = validatePayload(normalizedPayload);

    if (validationError) {
      return jsonResponse(400, { error: validationError }, corsHeaders);
    }

    const now = new Date();
    const windowBucket = floorTo15MinuteBucket(now);
    const ipAddress = extractIpAddress(req);
    const ipHash = ipAddress ? await sha256(ipAddress) : null;

    if (ipHash) {
      const ipAllowed = await enforceRateLimit(
        'edit_ip_15m',
        ipHash,
        windowBucket,
        EDIT_IP_RATE_LIMIT_MAX,
      );

      if (!ipAllowed) {
        return jsonResponse(429, { error: 'rate_limit_exceeded' }, corsHeaders);
      }
    }

    const editTokenHash = await sha256(normalizedPayload.editToken);
    const tokenAllowed = await enforceRateLimit(
      'edit_token_15m',
      editTokenHash,
      windowBucket,
      EDIT_TOKEN_RATE_LIMIT_MAX,
    );

    if (!tokenAllowed) {
      return jsonResponse(429, { error: 'rate_limit_exceeded' }, corsHeaders);
    }

    const existingSubmission = await getEditableSubmission(
      normalizedPayload.submissionId,
      editTokenHash,
    );

    if (!existingSubmission) {
      return jsonResponse(403, { error: 'edit_not_allowed' }, corsHeaders);
    }

    let speakerPicturePath: string | null = null;

    if (normalizedPayload.speakerPicture) {
      speakerPicturePath = await uploadSpeakerPicture(
        normalizedPayload.submissionId,
        normalizedPayload.speakerPicture,
      );
    }

    const nextStatus = existingSubmission.status === 'changes_requested'
      ? 'changes_submitted'
      : 'adjusted';

    const updateRows = await sql.begin(async (tx) => {
      const rows = await tx<UpdateResult[]>`
        update submissions.talk_submissions
        set
          status = ${nextStatus}::submissions.talk_submission_status,
          talk_title = ${normalizedPayload.talkTitle},
          talk_description = ${normalizedPayload.talkDescription},
          slides_url = ${normalizedPayload.slidesLink},
          speaker_first_name = ${normalizedPayload.speakerFirstName},
          speaker_last_name = ${normalizedPayload.speakerLastName},
          speaker_name = ${normalizedPayload.speakerName},
          speaker_label = ${normalizedPayload.speakerLabel ?? null},
          speaker_email = ${normalizedPayload.emailAddress},
          speaker_bio = ${normalizedPayload.speakerBio},
          personal_url = ${normalizedPayload.personalUrl ?? null},
          twitter_url = ${normalizedPayload.twitterUrl ?? null},
          linkedin_url = ${normalizedPayload.linkedinUrl ?? null},
          github_url = ${normalizedPayload.githubUrl ?? null},
          speaker_picture_path = coalesce(${speakerPicturePath}, speaker_picture_path)
        where id = ${normalizedPayload.submissionId}::uuid
          and edit_token_hash = ${editTokenHash}
          and status = ${existingSubmission.status}::submissions.talk_submission_status
        returning id, status
      `;

      if (rows.length === 0) {
        throw new Error('edit_not_allowed');
      }

      if (nextStatus === 'changes_submitted') {
        await tx`
          insert into submissions.talk_submission_status_events (
            submission_id,
            from_status,
            to_status,
            action,
            actor_kind
          )
          values (
            ${normalizedPayload.submissionId}::uuid,
            ${existingSubmission.status}::submissions.talk_submission_status,
            'changes_submitted'::submissions.talk_submission_status,
            'changes_submitted',
            'speaker'
          )
        `;
      }

      return rows;
    });

    if (
      speakerPicturePath
      && existingSubmission.speaker_picture_path
      && existingSubmission.speaker_picture_path !== speakerPicturePath
      && supabaseAdmin
    ) {
      const removeResult = await supabaseAdmin.storage
        .from(SPEAKER_PICTURE_BUCKET)
        .remove([existingSubmission.speaker_picture_path]);

      if (removeResult.error) {
        console.error('update-talk-submission old speaker picture removal failed', removeResult.error);
      }
    }

    const responseBody = updateRows[0]
      ? { id: updateRows[0].id, status: updateRows[0].status }
      : { id: normalizedPayload.submissionId, status: nextStatus };

    return jsonResponse(200, responseBody, corsHeaders);
  } catch (error) {
    if (error instanceof Error && error.message === 'edit_not_allowed') {
      return jsonResponse(403, { error: 'edit_not_allowed' }, corsHeaders);
    }

    if (error instanceof Error) {
      console.error('update-talk-submission failed', error.message, error.stack);
      return jsonResponse(500, { error: error.message }, corsHeaders);
    }

    console.error('update-talk-submission failed', error);
    return jsonResponse(500, { error: 'internal_error' }, corsHeaders);
  }
});

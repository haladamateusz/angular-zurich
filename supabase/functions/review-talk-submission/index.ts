import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import {
  getSiteUrl,
  sendTalkReviewEmail,
  type TalkReviewEmailAction,
} from '../_shared/talk-review-email.ts';

type ReviewAction = 'approve' | 'request_changes' | 'reject';

interface ReviewRequestBody {
  submissionId?: string;
  action?: ReviewAction;
  message?: string | null;
}

interface ReviewResult {
  id: string;
  status: string;
  speaker_id: string | null;
  speaker_picture_path: string | null;
}

interface SubmissionAssetSummary {
  speaker_picture_path: string | null;
}

interface SubmissionNotificationSummary {
  talk_title: string;
  speaker_name: string;
  speaker_email: string;
}

const sql = postgres(Deno.env.get('TALK_SUBMISSIONS_DB_URL') ?? '', {
  prepare: false,
});

type JsonRecord = Record<string, unknown>;

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://angular.zuerich',
  'https://www.angular.zuerich',
];

const PRIVATE_SPEAKER_PICTURE_BUCKET = 'talk-submission-assets';
const PUBLIC_SPEAKER_IMAGE_BUCKET = 'speaker-images';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SECRET_KEYS = Deno.env.get('SUPABASE_SECRET_KEYS');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseServiceKey = SUPABASE_SECRET_KEYS
  ? (JSON.parse(SUPABASE_SECRET_KEYS) as Record<string, string>).default
  : SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && supabaseServiceKey
  ? createClient(SUPABASE_URL, supabaseServiceKey)
  : null;

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

function isReviewAction(value: unknown): value is ReviewAction {
  return value === 'approve' || value === 'request_changes' || value === 'reject';
}

function getPublicSpeakerImagePath(
  submissionId: string,
  sourcePath: string,
): string {
  const extension = sourcePath.split('.').pop()?.toLowerCase() || 'bin';

  return ['speakers', `${submissionId}.${extension}`].join('/');
}

function getContentType(sourcePath: string, blob: Blob): string {
  if (blob.type) {
    return blob.type;
  }

  const extension = sourcePath.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function promoteSpeakerImage(
  submissionId: string,
  sourceSpeakerPicturePath: string | null,
): Promise<string | null> {
  if (
    !supabaseAdmin ||
    !sourceSpeakerPicturePath
  ) {
    return null;
  }

  const downloadResult = await supabaseAdmin.storage
    .from(PRIVATE_SPEAKER_PICTURE_BUCKET)
    .download(sourceSpeakerPicturePath);

  if (downloadResult.error) {
    throw new Error(`speaker_image_download_failed:${downloadResult.error.message}`);
  }

  const imageBlob = downloadResult.data;
  const publicImagePath = getPublicSpeakerImagePath(
    submissionId,
    sourceSpeakerPicturePath,
  );
  const uploadResult = await supabaseAdmin.storage
    .from(PUBLIC_SPEAKER_IMAGE_BUCKET)
    .upload(publicImagePath, imageBlob, {
      contentType: getContentType(sourceSpeakerPicturePath, imageBlob),
      cacheControl: '31536000',
      upsert: true,
    });

  if (uploadResult.error) {
    throw new Error(`speaker_image_upload_failed:${uploadResult.error.message}`);
  }

  const { data } = supabaseAdmin.storage
    .from(PUBLIC_SPEAKER_IMAGE_BUCKET)
    .getPublicUrl(publicImagePath);

  return data.publicUrl;
}

async function getSubmissionNotificationSummary(
  submissionId: string,
): Promise<SubmissionNotificationSummary | null> {
  const rows = await sql<SubmissionNotificationSummary[]>`
    select
      talk_title,
      speaker_name,
      speaker_email
    from submissions.talk_submissions
    where id = ${submissionId}::uuid
    limit 1
  `;

  return rows[0] ?? null;
}

async function notifySpeakerAboutReview(
  action: TalkReviewEmailAction,
  submissionId: string,
  organizerMessage: string | null,
): Promise<void> {
  const siteUrl = getSiteUrl();
  const submission = await getSubmissionNotificationSummary(submissionId);

  if (!submission) {
    console.warn('talk-review-email skipped: submission not found', submissionId);
    return;
  }

  await sendTalkReviewEmail({
    action,
    submissionId,
    talkTitle: submission.talk_title,
    speakerName: submission.speaker_name,
    speakerEmail: submission.speaker_email,
    organizerMessage,
    siteUrl,
  });
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

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !supabaseAdmin) {
    return jsonResponse(500, { error: 'supabase_not_configured' }, corsHeaders);
  }

  const authorization = req.headers.get('authorization');

  if (!authorization) {
    return jsonResponse(401, { error: 'missing_authorization' }, corsHeaders);
  }

  try {
    const body = (await req.json()) as ReviewRequestBody;

    if (!body.submissionId || !isReviewAction(body.action)) {
      return jsonResponse(400, { error: 'review_request_invalid' }, corsHeaders);
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    let speakerPictureUrl: string | null = null;

    if (body.action === 'approve') {
      const { data: submission, error: submissionError } = await supabaseUser
        .from('organizer_talk_submissions')
        .select('speaker_picture_path')
        .eq('id', body.submissionId)
        .single<SubmissionAssetSummary>();

      if (submissionError) {
        return jsonResponse(400, { error: submissionError.message }, corsHeaders);
      }

      speakerPictureUrl = await promoteSpeakerImage(
        body.submissionId,
        submission.speaker_picture_path,
      );
    }

    const { data, error } = await supabaseUser.rpc('review_talk_submission', {
      p_submission_id: body.submissionId,
      p_action: body.action,
      p_message: body.message ?? null,
      p_speaker_picture_url: speakerPictureUrl,
    });

    if (error) {
      return jsonResponse(400, { error: error.message }, corsHeaders);
    }

    const reviewResult = (data as ReviewResult[] | null)?.[0] ?? null;

    if (!reviewResult) {
      return jsonResponse(500, { error: 'review_result_missing' }, corsHeaders);
    }

    try {
      await notifySpeakerAboutReview(
        body.action,
        body.submissionId,
        body.message ?? null,
      );
    } catch (error) {
      if (error instanceof Error) {
        console.error('talk-review-email failed', error.message, error.stack);
      } else {
        console.error('talk-review-email failed', error);
      }
    }

    return jsonResponse(
      200,
      {
        ...reviewResult,
        speaker_picture_url: speakerPictureUrl,
      },
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error('review-talk-submission failed', error.message, error.stack);
    } else {
      console.error('review-talk-submission failed', error);
    }

    return jsonResponse(500, { error: 'internal_error' }, corsHeaders);
  }
});

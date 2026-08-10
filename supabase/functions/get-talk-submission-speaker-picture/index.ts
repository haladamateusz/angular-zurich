import { createClient } from '@supabase/supabase-js';

interface SpeakerPictureRequestBody {
  submissionId?: string;
  editToken?: string;
}

interface EditableSubmission {
  speaker_picture_path: string | null;
  can_edit: boolean;
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://angular.zuerich',
  'https://www.angular.zuerich',
];

const SPEAKER_PICTURE_BUCKET = 'talk-submission-assets';
const SIGNED_URL_EXPIRY_SECONDS = 5 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SECRET_KEYS = Deno.env.get('SUPABASE_SECRET_KEYS');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const supabaseServiceKey = getSupabaseServiceKey();
const supabaseAdmin =
  SUPABASE_URL && supabaseServiceKey ? createClient(SUPABASE_URL, supabaseServiceKey) : null;

function getSupabaseServiceKey(): string | undefined {
  if (!SUPABASE_SECRET_KEYS) {
    return SUPABASE_SERVICE_ROLE_KEY || undefined;
  }

  try {
    return (
      (JSON.parse(SUPABASE_SECRET_KEYS) as Record<string, string>).default ??
      SUPABASE_SERVICE_ROLE_KEY ??
      undefined
    );
  } catch (error) {
    console.error('get-talk-submission-speaker-picture secret key parse failed', error);
    return SUPABASE_SERVICE_ROLE_KEY || undefined;
  }
}

function jsonResponse(status: number, body: JsonRecord, headers: HeadersInit = {}): Response {
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
    origin && allowedOrigins.includes(origin) ? origin : (allowedOrigins[0] ?? '*');

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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  const originError = ensureAllowedOrigin(origin);

  if (originError) {
    return originError;
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'method_not_allowed' }, corsHeaders);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !supabaseAdmin) {
    return jsonResponse(500, { error: 'supabase_not_configured' }, corsHeaders);
  }

  try {
    const body = (await req.json()) as SpeakerPictureRequestBody;
    const submissionId = body.submissionId?.trim() ?? '';
    const editToken = body.editToken?.trim() ?? '';

    if (!UUID_PATTERN.test(submissionId) || !editToken) {
      return jsonResponse(400, { error: 'speaker_picture_request_invalid' }, corsHeaders);
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: submission, error: submissionError } = await supabaseUser
      .rpc('get_talk_submission_for_device', {
        p_submission_id: submissionId,
        p_edit_token: editToken,
      })
      .maybeSingle<EditableSubmission>();

    if (submissionError || !submission?.can_edit || !submission.speaker_picture_path) {
      return jsonResponse(404, { error: 'speaker_picture_not_available' }, corsHeaders);
    }

    const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
      .from(SPEAKER_PICTURE_BUCKET)
      .createSignedUrl(submission.speaker_picture_path, SIGNED_URL_EXPIRY_SECONDS);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      console.error('get-talk-submission-speaker-picture signed URL failed', signedUrlError);
      return jsonResponse(500, { error: 'speaker_picture_url_unavailable' }, corsHeaders);
    }

    return jsonResponse(200, { signedUrl: signedUrlData.signedUrl }, corsHeaders);
  } catch (error) {
    console.error('get-talk-submission-speaker-picture failed', error);
    return jsonResponse(500, { error: 'internal_error' }, corsHeaders);
  }
});

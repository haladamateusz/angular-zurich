import { createClient } from '@supabase/supabase-js';

interface RemoveRequestBody {
  submissionId?: string;
}

interface SubmissionAssetSummary {
  speaker_picture_path: string | null;
}

interface RemoveResult {
  id: string;
  speaker_picture_urls: string[] | null;
}

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
    console.error('remove-talk-submission secret key parse failed', error);
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

function getSpeakerImagePath(publicUrl: string): string | null {
  try {
    const sourceUrl = new URL(publicUrl);
    const supabaseUrl = new URL(SUPABASE_URL);
    const pathPrefix = `/storage/v1/object/public/${PUBLIC_SPEAKER_IMAGE_BUCKET}/`;

    if (sourceUrl.origin !== supabaseUrl.origin || !sourceUrl.pathname.startsWith(pathPrefix)) {
      return null;
    }

    const path = decodeURIComponent(sourceUrl.pathname.slice(pathPrefix.length));

    return path.startsWith('speakers/') ? path : null;
  } catch {
    return null;
  }
}

async function removeStorageObjects(
  privateSpeakerPicturePath: string | null,
  speakerPictureUrls: string[] | null,
): Promise<void> {
  if (!supabaseAdmin) {
    throw new Error('storage_not_configured');
  }

  if (privateSpeakerPicturePath) {
    const { error } = await supabaseAdmin.storage
      .from(PRIVATE_SPEAKER_PICTURE_BUCKET)
      .remove([privateSpeakerPicturePath]);

    if (error) {
      console.error('remove-talk-submission private speaker picture removal failed', error);
    }
  }

  const publicSpeakerPicturePaths = [
    ...new Set(
      (speakerPictureUrls ?? [])
        .map(getSpeakerImagePath)
        .filter((path): path is string => path !== null),
    ),
  ];

  if (publicSpeakerPicturePaths.length === 0) {
    return;
  }

  const { error } = await supabaseAdmin.storage
    .from(PUBLIC_SPEAKER_IMAGE_BUCKET)
    .remove(publicSpeakerPicturePaths);

  if (error) {
    console.error('remove-talk-submission public speaker picture removal failed', error);
  }
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

  const authorization = req.headers.get('authorization');

  if (!authorization) {
    return jsonResponse(401, { error: 'missing_authorization' }, corsHeaders);
  }

  try {
    const body = (await req.json()) as RemoveRequestBody;
    const submissionId = body.submissionId?.trim();

    if (!submissionId) {
      return jsonResponse(400, { error: 'remove_request_invalid' }, corsHeaders);
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: submission, error: submissionError } = await supabaseUser
      .from('organizer_talk_submissions')
      .select('speaker_picture_path')
      .eq('id', submissionId)
      .single<SubmissionAssetSummary>();

    if (submissionError || !submission) {
      return jsonResponse(404, { error: 'talk_submission_not_found' }, corsHeaders);
    }

    const { data, error } = await supabaseUser.rpc('remove_talk_submission', {
      p_submission_id: submissionId,
    });

    if (error) {
      return jsonResponse(400, { error: error.message }, corsHeaders);
    }

    const removalResult = (data as RemoveResult[] | null)?.[0] ?? null;

    if (!removalResult) {
      return jsonResponse(500, { error: 'remove_result_missing' }, corsHeaders);
    }

    await removeStorageObjects(submission.speaker_picture_path, removalResult.speaker_picture_urls);

    return jsonResponse(200, { id: removalResult.id }, corsHeaders);
  } catch (error) {
    if (error instanceof Error) {
      console.error('remove-talk-submission failed', error.message, error.stack);
    } else {
      console.error('remove-talk-submission failed', error);
    }

    return jsonResponse(500, { error: 'internal_error' }, corsHeaders);
  }
});

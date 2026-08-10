import { createClient } from '@supabase/supabase-js';

interface RemoveEventRequestBody {
  eventId?: string;
}

interface RemoveEventResult {
  id: string;
  feature_graphic: string | null;
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'https://angular.zuerich',
  'https://www.angular.zuerich',
];

const EVENT_IMAGE_BUCKET = 'events-feature-graphics';
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
    console.error('remove-event secret key parse failed', error);
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

function getEventImagePath(publicUrl: string): string | null {
  try {
    const sourceUrl = new URL(publicUrl);
    const supabaseUrl = new URL(SUPABASE_URL);
    const pathPrefix = `/storage/v1/object/public/${EVENT_IMAGE_BUCKET}/`;

    if (sourceUrl.origin !== supabaseUrl.origin || !sourceUrl.pathname.startsWith(pathPrefix)) {
      return null;
    }

    return decodeURIComponent(sourceUrl.pathname.slice(pathPrefix.length));
  } catch {
    return null;
  }
}

async function removeEventImage(featureGraphic: string | null): Promise<void> {
  if (!supabaseAdmin || !featureGraphic) {
    return;
  }

  const imagePath = getEventImagePath(featureGraphic);

  if (!imagePath) {
    return;
  }

  const { error } = await supabaseAdmin.storage.from(EVENT_IMAGE_BUCKET).remove([imagePath]);

  if (error) {
    console.error('remove-event feature graphic removal failed', error);
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
    const body = (await req.json()) as RemoveEventRequestBody;
    const eventId = body.eventId?.trim();

    if (!eventId || !UUID_PATTERN.test(eventId)) {
      return jsonResponse(400, { error: 'remove_event_request_invalid' }, corsHeaders);
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabaseUser.rpc('remove_event_with_talk_unassignment', {
      p_event_id: eventId,
    });

    if (error) {
      return jsonResponse(400, { error: error.message }, corsHeaders);
    }

    const removalResult = (data as RemoveEventResult[] | null)?.[0] ?? null;

    if (!removalResult) {
      return jsonResponse(500, { error: 'remove_event_result_missing' }, corsHeaders);
    }

    await removeEventImage(removalResult.feature_graphic);

    return jsonResponse(200, { id: removalResult.id }, corsHeaders);
  } catch (error) {
    if (error instanceof Error) {
      console.error('remove-event failed', error.message, error.stack);
    } else {
      console.error('remove-event failed', error);
    }

    return jsonResponse(500, { error: 'internal_error' }, corsHeaders);
  }
});

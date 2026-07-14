import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

interface UpdateEventResult {
  id: string;
  slug: string;
  feature_graphic: string;
}

type JsonRecord = Record<string, unknown>;

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:4200",
  "http://127.0.0.1:4200",
  "http://localhost:4201",
  "http://127.0.0.1:4201",
  "https://angular.zuerich",
  "https://www.angular.zuerich",
];
const EVENT_IMAGE_BUCKET = "events-feature-graphics";
const EVENT_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const EVENT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SECRET_KEYS = Deno.env.get("SUPABASE_SECRET_KEYS");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const DATABASE_URL = Deno.env.get("TALK_SUBMISSIONS_DB_URL") ?? "";
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
      console.error("supabase-secret-keys parse failed", error.message);
    } else {
      console.error("supabase-secret-keys parse failed", error);
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
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

function getAllowedOrigins(): string[] {
  const configured = Deno.env.get("TALK_SUBMISSIONS_ALLOWED_ORIGINS");

  if (!configured) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return configured
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function getCorsHeaders(origin: string | null): HeadersInit {
  const allowedOrigins = getAllowedOrigins();
  const accessControlAllowOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] ?? "*";

  return {
    "Access-Control-Allow-Origin": accessControlAllowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function ensureAllowedOrigin(origin: string | null): Response | null {
  if (!origin || getAllowedOrigins().includes(origin)) {
    return null;
  }

  return jsonResponse(
    403,
    { error: "origin_not_allowed" },
    getCorsHeaders(origin),
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseTalkIds(value: FormDataEntryValue | null): string[] | null {
  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (
      !Array.isArray(parsed) ||
      !parsed.every((talkId) => typeof talkId === "string")
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function getImageExtension(contentType: string): string {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

async function isAllowedAdministrator(email: string): Promise<boolean> {
  const rows = await sql<{ is_allowed: boolean }[]>`
    select private.is_allowed_google_account(${email}) as is_allowed
  `;

  return rows[0]?.is_allowed ?? false;
}

async function removeUploadedImage(imagePath: string | null): Promise<void> {
  if (!imagePath || !supabaseAdmin) {
    return;
  }

  const { error } = await supabaseAdmin.storage.from(EVENT_IMAGE_BUCKET).remove(
    [imagePath],
  );

  if (error) {
    console.error("update-event image cleanup failed", error.message);
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const originError = ensureAllowedOrigin(origin);

  if (originError) {
    return originError;
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" }, corsHeaders);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !supabaseAdmin || !DATABASE_URL) {
    return jsonResponse(
      500,
      { error: "update_event_not_configured" },
      corsHeaders,
    );
  }

  const authorization = req.headers.get("authorization");

  if (!authorization) {
    return jsonResponse(401, { error: "missing_authorization" }, corsHeaders);
  }

  let uploadedImagePath: string | null = null;

  try {
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabaseUser.auth
      .getUser(accessToken);
    const userEmail = userData.user?.email?.trim().toLowerCase() ?? "";

    if (userError || !userEmail) {
      return jsonResponse(401, { error: "invalid_authorization" }, corsHeaders);
    }

    if (!(await isAllowedAdministrator(userEmail))) {
      return jsonResponse(403, { error: "not_allowed" }, corsHeaders);
    }

    const formData = await req.formData();
    const eventId = typeof formData.get("eventId") === "string"
      ? String(formData.get("eventId")).trim()
      : "";
    const title = typeof formData.get("title") === "string"
      ? String(formData.get("title")).trim()
      : "";
    const startsAtValue = typeof formData.get("startsAt") === "string"
      ? String(formData.get("startsAt")).trim()
      : "";
    const meetupUrl = typeof formData.get("meetupUrl") === "string"
      ? String(formData.get("meetupUrl")).trim()
      : "";
    const venueId = typeof formData.get("venueId") === "string"
      ? String(formData.get("venueId")).trim()
      : "";
    const publicValue = typeof formData.get("public") === "string"
      ? String(formData.get("public")).trim().toLowerCase()
      : "";
    const isPublic = publicValue === "true"
      ? true
      : publicValue === "false"
      ? false
      : null;
    const talkIds = parseTalkIds(formData.get("talkIds"));
    const featureGraphic = formData.get("featureGraphic");
    const startsAt = new Date(startsAtValue);

    if (!UUID_PATTERN.test(eventId)) {
      return jsonResponse(400, { error: "event_id_invalid" }, corsHeaders);
    }

    if (title.length < 3 || title.length > 160) {
      return jsonResponse(400, { error: "event_title_invalid" }, corsHeaders);
    }

    if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() <= Date.now()) {
      return jsonResponse(400, { error: "event_start_invalid" }, corsHeaders);
    }

    if (!isHttpUrl(meetupUrl) || meetupUrl.length > 500) {
      return jsonResponse(
        400,
        { error: "event_meetup_url_invalid" },
        corsHeaders,
      );
    }

    if (!UUID_PATTERN.test(venueId)) {
      return jsonResponse(400, { error: "event_venue_invalid" }, corsHeaders);
    }

    if (isPublic === null) {
      return jsonResponse(400, { error: "event_public_invalid" }, corsHeaders);
    }

    if (
      !talkIds ||
      talkIds.length < 2 ||
      talkIds.length > 3 ||
      new Set(talkIds).size !== talkIds.length ||
      !talkIds.every((talkId) => UUID_PATTERN.test(talkId))
    ) {
      return jsonResponse(400, { error: "event_talks_invalid" }, corsHeaders);
    }

    let featureGraphicUrl: string | null = null;

    if (featureGraphic !== null) {
      if (!(featureGraphic instanceof File)) {
        return jsonResponse(
          400,
          { error: "event_feature_graphic_invalid" },
          corsHeaders,
        );
      }

      if (
        !EVENT_IMAGE_TYPES.includes(
          featureGraphic.type as (typeof EVENT_IMAGE_TYPES)[number],
        ) ||
        featureGraphic.size > EVENT_IMAGE_MAX_SIZE_BYTES
      ) {
        return jsonResponse(
          400,
          { error: "event_feature_graphic_invalid" },
          corsHeaders,
        );
      }

      uploadedImagePath = `events/${crypto.randomUUID()}.${
        getImageExtension(featureGraphic.type)
      }`;
      const uploadResult = await supabaseAdmin.storage
        .from(EVENT_IMAGE_BUCKET)
        .upload(uploadedImagePath, featureGraphic, {
          cacheControl: "31536000",
          contentType: featureGraphic.type,
          upsert: false,
        });

      if (uploadResult.error) {
        return jsonResponse(
          400,
          { error: uploadResult.error.message },
          corsHeaders,
        );
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from(EVENT_IMAGE_BUCKET)
        .getPublicUrl(uploadedImagePath);
      featureGraphicUrl = publicUrlData.publicUrl;
    }

    const { data, error } = await supabaseUser.rpc("update_event_with_talks", {
      p_event_id: eventId,
      p_title: title,
      p_starts_at: startsAt.toISOString(),
      p_meetup_url: meetupUrl,
      p_venue_id: venueId,
      p_feature_graphic_url: featureGraphicUrl,
      p_talk_ids: talkIds,
      p_public: isPublic,
    });

    if (error) {
      await removeUploadedImage(uploadedImagePath);
      uploadedImagePath = null;
      return jsonResponse(400, { error: error.message }, corsHeaders);
    }

    const event = (data as UpdateEventResult[] | null)?.[0] ?? null;

    if (!event) {
      await removeUploadedImage(uploadedImagePath);
      uploadedImagePath = null;
      return jsonResponse(
        500,
        { error: "update_event_result_missing" },
        corsHeaders,
      );
    }

    uploadedImagePath = null;

    return jsonResponse(200, { ...event }, corsHeaders);
  } catch (error) {
    await removeUploadedImage(uploadedImagePath);

    if (error instanceof Error) {
      console.error("update-event failed", error.message, error.stack);
    } else {
      console.error("update-event failed", error);
    }

    return jsonResponse(500, { error: "internal_error" }, corsHeaders);
  }
});

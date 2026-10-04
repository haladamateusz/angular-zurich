export interface OrganizerSpeakerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  abstract: string | null;
  label: string | null;
  personal_url: string | null;
  twitter_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  picture_url: string | null;
}

interface OrganizerSpeakerAccess {
  getUserEmail(token: string): Promise<string | null>;
  isAllowed(email: string): Promise<boolean>;
  getProfile(slug: string): Promise<OrganizerSpeakerProfile | null>;
}

type OrganizerSpeakerResult =
  | { profile: OrganizerSpeakerProfile; error?: never; status?: never }
  | { profile?: never; error: string; status: number };

function validHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function validText(value: string | null, min: number, max: number): boolean {
  const length = value?.trim().length ?? 0;
  return length >= min && length <= max;
}

export async function resolveOrganizerSpeaker(
  authorization: string | null,
  slug: unknown,
  access: OrganizerSpeakerAccess,
): Promise<OrganizerSpeakerResult> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return { status: 401, error: 'organizer_authorization_required' };
  const email = await access.getUserEmail(token);
  if (!email) return { status: 401, error: 'organizer_authorization_required' };
  if (!(await access.isAllowed(email))) return { status: 403, error: 'organizer_not_allowed' };
  if (typeof slug !== 'string' || !slug.trim() || slug.length > 200) {
    return { status: 400, error: 'organizer_profile_unavailable' };
  }
  const profile = await access.getProfile(slug.trim());
  if (!profile) return { status: 400, error: 'organizer_profile_unavailable' };
  if (
    !validText(profile.first_name, 2, 60) ||
    !validText(profile.last_name, 2, 59) ||
    !validText(profile.email, 5, 320) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email ?? '') ||
    (Boolean(profile.abstract?.trim()) && !validText(profile.abstract, 20, 4000)) ||
    !profile.picture_url ||
    !validHttpUrl(profile.picture_url) ||
    (profile.label?.length ?? 0) > 160 ||
    [profile.personal_url, profile.twitter_url, profile.linkedin_url, profile.github_url].some(
      (url) => Boolean(url) && (url!.length > 500 || !validHttpUrl(url!)),
    )
  ) {
    return { status: 400, error: 'organizer_profile_incomplete' };
  }
  return { profile };
}

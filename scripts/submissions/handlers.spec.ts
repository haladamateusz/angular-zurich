import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sql: vi.fn(),
  getUser: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  received: vi.fn(),
  organizers: vi.fn(),
  changes: vi.fn(),
}));
vi.mock('../../supabase/functions/_shared/database.ts', () => ({
  createDatabaseClient: () => mocks.sql,
}));
vi.mock('npm:@supabase/supabase-js@2', () => ({
  createClient: () => ({
    auth: { getUser: mocks.getUser },
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
  }),
}));
vi.mock('../../supabase/functions/_shared/talk-review-email.ts', () => ({
  getSiteUrl: () => 'https://example.com',
  sendTalkSubmissionReceivedEmail: mocks.received,
  sendTalkSubmissionChangesReceivedEmail: mocks.changes,
}));
vi.mock('../../supabase/functions/_shared/talk-submission-notify-organizers.ts', () => ({
  sendTalkSubmissionToOrganizersEmail: mocks.organizers,
}));

const profile = {
  id: '82c8bec4-edc2-45a3-a313-a1570c1513f2',
  first_name: 'Mateusz',
  last_name: 'Halada',
  email: 'speaker@example.com',
  abstract: 'An Angular developer and community organizer.',
  label: 'Organizer',
  personal_url: null,
  twitter_url: null,
  linkedin_url: null,
  github_url: null,
  picture_url: 'https://example.com/existing-photo.jpg',
};
const submissionId = '26ae62f7-0e69-4cfd-b55a-66568817718a';
const editSnapshot = {
  id: submissionId,
  status: 'initially_submitted',
  organizer_speaker_id: profile.id,
  speaker_first_name: profile.first_name,
  speaker_last_name: profile.last_name,
  speaker_name: 'Mateusz Halada',
  speaker_label: profile.label,
  speaker_email: profile.email,
  speaker_bio: profile.abstract,
  personal_url: null,
  twitter_url: null,
  linkedin_url: null,
  github_url: null,
  speaker_picture_path: null,
};
let handler: (req: Request) => Promise<Response>;
let writes: { query: string; values: unknown[] }[];
let allowed: boolean;
let foundProfile: (Omit<typeof profile, 'abstract'> & { abstract: string | null }) | null;
let editable:
  | (Omit<typeof editSnapshot, 'organizer_speaker_id'> & { organizer_speaker_id: string | null })
  | null;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  writes = [];
  allowed = true;
  foundProfile = { ...profile };
  editable = { ...editSnapshot };
  mocks.getUser.mockResolvedValue({ data: { user: { email: 'admin@example.com' } }, error: null });
  mocks.sql.mockImplementation(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join('?');
    if (query.includes('is_allowed_google_account')) return [{ allowed }];
    if (query.includes('join public."PeopleOnRoles"')) return foundProfile ? [foundProfile] : [];
    if (query.includes('talk_submission_rate_limits')) return [{ request_count: 1 }];
    if (query.includes('allowed_google_accounts account'))
      return [{ email: 'admin@example.com', firstName: 'Admin' }];
    if (query.includes('select id, status, speaker_picture_path'))
      return editable ? [editable] : [];
    if (
      query.includes('insert into submissions.talk_submissions') ||
      query.includes('update submissions.talk_submissions')
    ) {
      writes.push({ query, values });
      return [{ id: submissionId, status: 'adjusted' }];
    }
    return [];
  });
  Object.assign(mocks.sql, {
    begin: async (fn: (tx: typeof mocks.sql) => Promise<unknown>) => fn(mocks.sql),
  });
  vi.stubGlobal('Deno', {
    env: {
      get: (key: string) =>
        ({
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_SERVICE_ROLE_KEY: 'test',
          TALK_SUBMISSIONS_DB_URL: 'test',
          TURNSTILE_SECRET_KEY: 'test',
        })[key],
    },
    serve: (fn: typeof handler) => {
      handler = fn;
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

function request(fields: Record<string, string> = {}, token: string | null = 'valid') {
  const form = new FormData();
  for (const [name, value] of Object.entries({
    talkTitle: 'Angular signals',
    talkDescription: 'A practical introduction to building Angular applications with signals.',
    slidesLink: 'https://example.com/slides',
    organizerSpeakerSlug: 'mateusz-halada',
    ...fields,
  }))
    form.set(name, value);
  return new Request('https://example.com', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
}

async function submit(req: Request) {
  await import('../../supabase/functions/submit-talk/index.ts');
  return handler(req);
}

it.each([
  ['Mateusz', 'Halada', 'mateusz-halada'],
  ['Tomas', 'Trajan', 'tomas-trajan'],
])(
  'submits %s with the existing profile, notifications and no CAPTCHA or upload',
  async (first_name, last_name, slug) => {
    foundProfile = { ...profile, first_name, last_name };
    const response = await submit(
      request({
        organizerSpeakerSlug: slug,
        speakerFirstName: 'Forged',
        emailAddress: 'attacker@example.com',
        speakerBio: 'Forged speaker biography for overwrite attempts.',
      }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        id: submissionId,
        status: 'initially_submitted',
        editToken: expect.any(String),
      }),
    );
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
    expect(writes[0].values).toContain(profile.id);
    expect(writes[0].values).toContain(profile.picture_url);
    expect(writes[0].values).toContain(first_name);
    expect(writes[0].values[9]).toBe(profile.abstract);
    expect(writes[0].values).not.toContain('Forged');
    expect(writes[0].values).not.toContain('attacker@example.com');
    expect(mocks.received).toHaveBeenCalledWith(
      expect.objectContaining({ speakerEmail: profile.email }),
    );
    expect(mocks.organizers).toHaveBeenCalledOnce();
  },
);

it.each([null, '', '   '])(
  'accepts an organizer without a biography (%j) and ignores a forged biography',
  async (abstract) => {
    foundProfile = { ...profile, abstract };
    const response = await submit(
      request({ speakerBio: 'A forged biography must not be saved to the profile.' }),
    );
    expect(response.status).toBe(201);
    expect(writes).toHaveLength(1);
    expect(writes[0].values[9]).toBe('');
    expect(mocks.organizers).toHaveBeenCalledOnce();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(
      mocks.sql.mock.calls.some(([parts]) => parts.join('').includes('update public."People"')),
    ).toBe(false);
  },
);

it.each(['Short biography', 'x'.repeat(4001)])(
  'rejects nonempty organizer biographies outside the length limits',
  async (abstract) => {
    foundProfile = { ...profile, abstract };
    const response = await submit(request());
    expect(await response.json()).toEqual({ error: 'organizer_profile_incomplete' });
    expect(writes).toHaveLength(0);
  },
);

it('rejects a standard proposal with an empty biography even with a forged organizer flag', async () => {
  const req = request({
    speakerFirstName: 'Guest',
    speakerLastName: 'Speaker',
    emailAddress: 'guest@example.com',
    speakerBio: '',
    isOrganizer: 'true',
  });
  const form = await req.formData();
  form.delete('organizerSpeakerSlug');
  form.set('speakerPicture', new File(['photo'], 'photo.png', { type: 'image/png' }));
  const response = await submit(new Request(req.url, { method: 'POST', body: form }));
  expect(await response.json()).toEqual({ error: 'speaker_bio_invalid' });
  expect(writes).toHaveLength(0);
});

it('rejects missing and expired tokens before profile lookup or writes', async () => {
  expect((await submit(request({}, null))).status).toBe(401);
  expect(mocks.sql).not.toHaveBeenCalled();
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('expired') });
  expect((await handler(request({}, 'expired'))).status).toBe(401);
  expect(writes).toHaveLength(0);
});

it('rejects authenticated accounts removed from the allowlist', async () => {
  allowed = false;
  expect((await submit(request())).status).toBe(403);
  expect(writes).toHaveLength(0);
});

it('rejects nonexistent or non-organizer profiles and incomplete profiles', async () => {
  foundProfile = null;
  let response = await submit(request({ organizerSpeakerSlug: 'guest-speaker' }));
  expect(await response.json()).toEqual({ error: 'organizer_profile_unavailable' });
  foundProfile = { ...profile, email: '' };
  response = await handler(request());
  expect(await response.json()).toEqual({ error: 'organizer_profile_incomplete' });
  expect(writes).toHaveLength(0);
});

it('preserves public speaker and photo validation', async () => {
  const req = request(
    {
      speakerFirstName: 'Guest',
      speakerLastName: 'Speaker',
      emailAddress: 'guest@example.com',
      speakerBio: 'A guest speaker with an interesting Angular proposal.',
    },
    null,
  );
  const form = await req.formData();
  form.delete('organizerSpeakerSlug');
  const response = await submit(new Request(req.url, { method: 'POST', body: form }));
  expect(await response.json()).toEqual({ error: 'speaker_picture_required' });
  expect(writes).toHaveLength(0);
});

it('still requires CAPTCHA for a complete public proposal', async () => {
  const req = request(
    {
      speakerFirstName: 'Guest',
      speakerLastName: 'Speaker',
      emailAddress: 'guest@example.com',
      speakerBio: 'A guest speaker with an interesting Angular proposal.',
    },
    null,
  );
  const form = await req.formData();
  form.delete('organizerSpeakerSlug');
  form.set('speakerPicture', new File(['photo'], 'photo.png', { type: 'image/png' }));
  const response = await submit(new Request(req.url, { method: 'POST', body: form }));
  expect(await response.json()).toEqual({ error: 'captcha_invalid' });
  expect(writes).toHaveLength(0);
});

describe('organizer edits', () => {
  it.each([profile.abstract, ''])(
    'preserves the biography snapshot (%j) and ignores forged speaker fields while saving talk changes',
    async (speaker_bio) => {
      editable = { ...editSnapshot, speaker_bio };
      await import('../../supabase/functions/update-talk-submission/index.ts');
      const req = request(
        {
          submissionId,
          editToken: 'x'.repeat(64),
          talkTitle: 'Revised Angular signals',
          speakerFirstName: 'Forged',
          speakerBio: 'Forged biography that should never replace the snapshot.',
          emailAddress: 'attacker@example.com',
          organizerSpeakerSlug: 'tomas-trajan',
        },
        null,
      );
      const form = await req.formData();
      form.set('speakerPicture', new File(['forged'], 'new.png', { type: 'image/png' }));
      const response = await handler(new Request(req.url, { method: 'POST', body: form }));
      expect(response.status).toBe(200);
      expect(writes[0].values).toContain('Revised Angular signals');
      expect(writes[0].values).toContain(profile.first_name);
      expect(writes[0].values[9]).toBe(speaker_bio);
      expect(writes[0].values).not.toContain('Forged');
      expect(writes[0].values).not.toContain('attacker@example.com');
      expect(mocks.upload).not.toHaveBeenCalled();
    },
  );

  it('requires a biography for standard edits despite a forged organizer selection', async () => {
    editable = { ...editSnapshot, organizer_speaker_id: null };
    await import('../../supabase/functions/update-talk-submission/index.ts');
    const response = await handler(
      request(
        {
          submissionId,
          editToken: 'x'.repeat(64),
          speakerFirstName: 'Guest',
          speakerLastName: 'Speaker',
          emailAddress: 'guest@example.com',
          speakerBio: '',
        },
        null,
      ),
    );
    expect(await response.json()).toEqual({ error: 'speaker_bio_invalid' });
    expect(writes).toHaveLength(0);
  });

  it('rejects an invalid device token without changing data', async () => {
    editable = null;
    await import('../../supabase/functions/update-talk-submission/index.ts');
    expect((await handler(request({ submissionId, editToken: 'invalid' }, null))).status).toBe(403);
    expect(writes).toHaveLength(0);
  });
});

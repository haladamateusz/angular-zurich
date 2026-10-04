import { TestBed } from '@angular/core/testing';

import { AuthService } from '../../auth/auth.service';
import { SupabaseClientService } from './supabase-client.service';

import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SupabaseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

describe('SupabaseService public stats', () => {
  const single = vi.fn();
  const rpc = vi.fn(() => ({ single }));

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseClientService, useValue: { getClient: () => ({ rpc }) } },
        { provide: AuthService, useValue: {} },
      ],
    });
  });

  it('returns the aggregate row without fetching speaker associations', async () => {
    const counts = { talks: 59, speakers: 36, events: 41 };
    single.mockResolvedValue({ data: counts, error: null });

    expect(await TestBed.inject(SupabaseService).getStatsCounts()).toEqual(counts);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('get_public_stats');
  });

  it('preserves legitimate zero counts', async () => {
    single.mockResolvedValue({ data: { talks: 0, speakers: 0, events: 0 }, error: null });
    expect(await TestBed.inject(SupabaseService).getStatsCounts()).toEqual({
      talks: 0,
      speakers: 0,
      events: 0,
    });
  });

  it('propagates RPC failures instead of displaying false zero totals', async () => {
    const error = { message: 'Database unavailable' };
    single.mockResolvedValue({ data: null, error });
    await expect(TestBed.inject(SupabaseService).getStatsCounts()).rejects.toBe(error);
  });
});

describe('SupabaseService organizer submission transport', () => {
  const fetchMock = vi.fn();
  const session = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    session.mockReturnValue({ access_token: 'organizer-token' });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 'proposal', status: 'initially_submitted' }), {
        status: 201,
      }),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseClientService, useValue: { getClient: () => ({}) } },
        { provide: AuthService, useValue: { session } },
      ],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('sends the organizer token and no editable speaker fields', async () => {
    await TestBed.inject(SupabaseService).submitTalk({
      talkTitle: 'Signals',
      talkDescription: 'Description',
      slidesLink: 'https://example.com',
      organizerSpeakerSlug: 'tomas-trajan',
    });
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(options.headers).toEqual(
      expect.objectContaining({ authorization: 'Bearer organizer-token' }),
    );
    expect(Array.from((options.body as FormData).keys())).toEqual([
      'talkTitle',
      'talkDescription',
      'slidesLink',
      'organizerSpeakerSlug',
    ]);
  });

  it('rejects organizer submissions locally when the session is absent', async () => {
    session.mockReturnValue(null);
    const result = await TestBed.inject(SupabaseService).submitTalk({
      talkTitle: 'Signals',
      talkDescription: 'Description',
      slidesLink: 'https://example.com',
      organizerSpeakerSlug: 'tomas-trajan',
    });
    expect(result.error?.message).toBe('organizer_authorization_required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

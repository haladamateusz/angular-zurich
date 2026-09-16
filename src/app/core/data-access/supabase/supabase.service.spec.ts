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

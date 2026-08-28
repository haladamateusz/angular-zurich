import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Session } from '@supabase/supabase-js';
import { AuthService } from './auth.service';
import { SupabaseClientService } from '../data-access/supabase/supabase-client.service';

describe('AuthService', () => {
  const session = {
    user: {
      id: 'organizer-1',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2026-01-01T00:00:00.000Z',
    },
  } as Session;

  let resolveSession: (value: { data: { session: Session | null } }) => void;
  let getSession: ReturnType<typeof vi.fn>;
  let onAuthStateChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const sessionPromise = new Promise<{ data: { session: Session | null } }>((resolve) => {
      resolveSession = resolve;
    });

    getSession = vi.fn(() => sessionPromise);
    onAuthStateChange = vi.fn(() => ({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    }));

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: SupabaseClientService,
          useValue: {
            getClient: () => ({
              auth: {
                getSession,
                onAuthStateChange,
              },
            }),
          },
        },
      ],
    });
  });

  it('shares the in-flight session restoration with application startup', async () => {
    const authService = TestBed.inject(AuthService);

    const initialization = authService.initialize();

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(authService.isInitialized()).toBe(false);

    resolveSession({ data: { session } });
    await initialization;

    expect(authService.isInitialized()).toBe(true);
    expect(authService.isAuthenticated()).toBe(true);
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
  });
});

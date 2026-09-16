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
  let exchangeCodeForSession: ReturnType<typeof vi.fn>;
  let unsubscribe: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const sessionPromise = new Promise<{ data: { session: Session | null } }>((resolve) => {
      resolveSession = resolve;
    });

    getSession = vi.fn(() => sessionPromise);
    unsubscribe = vi.fn();
    exchangeCodeForSession = vi.fn();
    onAuthStateChange = vi.fn(() => ({
      data: {
        subscription: {
          unsubscribe,
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
                exchangeCodeForSession,
              },
            }),
          },
        },
      ],
    });
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('initializes without contacting Auth during server rendering', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    expect(auth.isInitialized()).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('recovers from session restoration failure as signed out', async () => {
    getSession.mockRejectedValueOnce(new Error('Offline'));
    const auth = TestBed.inject(AuthService);
    await auth.initialize();
    expect(auth.isInitialized()).toBe(true);
    expect(auth.isAuthenticated()).toBe(false);
    expect(onAuthStateChange).toHaveBeenCalledOnce();
  });

  it('does not subscribe when destroyed during session restoration', async () => {
    const auth = TestBed.inject(AuthService);
    const initialization = auth.initialize();
    TestBed.resetTestingModule();
    resolveSession({ data: { session } });
    await initialization;
    expect(onAuthStateChange).not.toHaveBeenCalled();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('unsubscribes from Auth events on destruction', async () => {
    const auth = TestBed.inject(AuthService);
    resolveSession({ data: { session } });
    await auth.initialize();
    TestBed.resetTestingModule();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('clears the restored session when a sign-out event arrives', async () => {
    const auth = TestBed.inject(AuthService);
    resolveSession({ data: { session } });
    await auth.initialize();
    const listener = onAuthStateChange.mock.calls[0][0] as (
      event: string,
      session: Session | null,
    ) => void;
    listener('SIGNED_OUT', null);
    expect(auth.session()).toBeNull();
    expect(auth.userProfile()).toBeNull();
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('exchanges the callback code and removes it from the browser URL', async () => {
    const auth = TestBed.inject(AuthService);
    resolveSession({ data: { session: null } });
    await auth.initialize();
    window.history.replaceState({}, '', '/auth/callback?code=single-use-code');
    exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
    expect(await auth.completeGoogleSignIn()).toBe('success');
    expect(exchangeCodeForSession).toHaveBeenCalledWith('single-use-code');
    expect(auth.session()).toEqual(session);
    expect(window.location.search).toBe('');
    expect(auth.consumeErrorMessage()).toBeNull();
  });

  it.each(['?', '#'])(
    'rejects provider denial in the %s callback parameters',
    async (separator) => {
      const auth = TestBed.inject(AuthService);
      resolveSession({ data: { session } });
      await auth.initialize();
      window.history.replaceState(
        {},
        '',
        `/auth/callback${separator}error_description=not%20authorized`,
      );
      expect(await auth.completeGoogleSignIn()).toBe('unauthorized');
      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.consumeErrorMessage()).toBe(
        'This Google account doesn’t have organizer access. Sign in with an approved account.',
      );
      expect(auth.consumeErrorMessage()).toBeNull();
      expect(exchangeCodeForSession).not.toHaveBeenCalled();
    },
  );

  it.each(['returned error', 'thrown error', 'missing session'])(
    'handles %s during code exchange',
    async (failure) => {
      const auth = TestBed.inject(AuthService);
      resolveSession({ data: { session } });
      await auth.initialize();
      window.history.replaceState({}, '', '/auth/callback?code=expired');
      if (failure === 'thrown error') {
        exchangeCodeForSession.mockRejectedValue(new Error('Internal provider details'));
      } else {
        exchangeCodeForSession.mockResolvedValue({
          data: { session: null },
          error: failure === 'returned error' ? new Error('Internal provider details') : null,
        });
      }
      expect(await auth.completeGoogleSignIn()).toBe('error');
      expect(auth.isAuthenticated()).toBe(false);
      expect(auth.consumeErrorMessage()).toBe('We could not complete sign-in. Please try again.');
    },
  );

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

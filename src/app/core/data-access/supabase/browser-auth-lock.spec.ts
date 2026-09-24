import { NavigatorLockAcquireTimeoutError } from '@supabase/supabase-js';
import { browserAuthLock } from './browser-auth-lock';

describe('browserAuthLock', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('skips contention without rejecting the native browser callback or running unlocked', async () => {
    const operation = vi.fn();
    let callbackResult: Promise<unknown> | undefined;
    const request = vi.fn((_name, _options, callback: (lock: Lock | null) => Promise<unknown>) => {
      callbackResult = callback(null);
      return callbackResult;
    });
    vi.stubGlobal('navigator', { locks: { request } });

    await expect(browserAuthLock('auth', 0, operation)).rejects.toBeInstanceOf(
      NavigatorLockAcquireTimeoutError,
    );
    await expect(callbackResult).resolves.toMatchObject({ ok: false });
    expect(operation).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith(
      'auth',
      { mode: 'exclusive', ifAvailable: true },
      expect.any(Function),
    );
  });

  it('holds the lock until the operation finishes and returns its value', async () => {
    let release!: (value: string) => void;
    let held = false;
    vi.stubGlobal('navigator', {
      locks: {
        request: async (
          _name: string,
          _options: LockOptions,
          callback: (lock: object) => Promise<unknown>,
        ) => {
          held = true;
          try {
            return await callback({ name: 'auth' });
          } finally {
            held = false;
          }
        },
      },
    });
    const result = browserAuthLock(
      'auth',
      0,
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    expect(held).toBe(true);
    release('session');
    await expect(result).resolves.toBe('session');
    expect(held).toBe(false);
  });

  it('propagates real operation failures without rejecting the native callback', async () => {
    const failure = new Error('refresh request failed');
    let callbackResult: Promise<unknown> | undefined;
    vi.stubGlobal('navigator', {
      locks: {
        request: (
          _name: string,
          _options: LockOptions,
          callback: (lock: object) => Promise<unknown>,
        ) => {
          callbackResult = callback({ name: 'auth' });
          return callbackResult;
        },
      },
    });
    await expect(
      browserAuthLock('auth', 0, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await expect(callbackResult).resolves.toEqual({ ok: false, error: failure });
  });

  it('keeps normal session operations on the SDK waiting lock', async () => {
    const request = vi.fn(async (_name, _options, callback: (lock: object) => Promise<unknown>) =>
      callback({ name: 'auth' }),
    );
    vi.stubGlobal('navigator', { locks: { request } });
    await expect(browserAuthLock('auth', 5000, async () => 'session')).resolves.toBe('session');
    expect(request).toHaveBeenCalledWith(
      'auth',
      { mode: 'exclusive', signal: expect.any(AbortSignal) },
      expect.any(Function),
    );
  });
});

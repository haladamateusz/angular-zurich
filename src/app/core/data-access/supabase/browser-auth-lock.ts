import { NavigatorLockAcquireTimeoutError, navigatorLock } from '@supabase/supabase-js';

type LockResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** Keep background refresh contention out of the browser's native lock callback. */
export async function browserAuthLock<T>(
  name: string,
  acquireTimeout: number,
  operation: () => Promise<T>,
): Promise<T> {
  // Session reads/writes keep the SDK's normal waiting and timeout behaviour.
  if (acquireTimeout !== 0) return navigatorLock(name, acquireTimeout, operation);

  const result = await navigator.locks.request(
    name,
    { mode: 'exclusive', ifAvailable: true },
    async (lock): Promise<LockResult<T>> => {
      if (!lock) {
        return {
          ok: false,
          error: new NavigatorLockAcquireTimeoutError('Auth refresh lock is already held.'),
        };
      }
      try {
        return { ok: true, value: await operation() };
      } catch (error) {
        return { ok: false, error };
      }
    },
  );

  // Throw in the caller's promise chain, not the browser callback. Supabase
  // catches this exact timeout type and skips a contended background refresh.
  // Preserve real operation errors instead of masking them as lock contention.
  if (!result.ok) throw result.error;
  return result.value;
}

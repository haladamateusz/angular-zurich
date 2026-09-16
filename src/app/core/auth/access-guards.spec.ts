import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { AuthService } from './auth.service';
import { SupabaseService } from '../data-access/supabase/supabase.service';
import { organizerAuthGuard } from './organizer-auth.guard';
import { eventAdminGuard } from './event-admin.guard';

describe.each([
  { name: 'organizer', guard: organizerAuthGuard },
  { name: 'event admin', guard: eventAdminGuard },
])('$name access guard', ({ guard }) => {
  const auth = {
    waitUntilInitialized: vi.fn(),
    isAuthenticated: vi.fn(),
  };
  const canManage = vi.fn();
  const run = () =>
    TestBed.runInInjectionContext(() =>
      guard(new ActivatedRouteSnapshot(), {} as RouterStateSnapshot),
    );

  beforeEach(() => {
    auth.waitUntilInitialized.mockReset().mockResolvedValue(undefined);
    auth.isAuthenticated.mockReset().mockReturnValue(false);
    canManage.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: AuthService, useValue: auth },
        { provide: SupabaseService, useValue: { canCurrentUserManageEvents: canManage } },
      ],
    });
  });

  it('redirects signed-out visitors without querying management permissions', async () => {
    const result = await run();
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
    expect(canManage).not.toHaveBeenCalled();
  });

  it('waits for restored authentication before deciding access', async () => {
    let finish!: () => void;
    auth.waitUntilInitialized.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const result = run();
    expect(auth.isAuthenticated).not.toHaveBeenCalled();
    auth.isAuthenticated.mockReturnValue(true);
    finish();
    expect(await result).toBe(true);
  });

  it('defers browser authentication during server rendering', async () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    expect(await run()).toBe(true);
    expect(auth.waitUntilInitialized).not.toHaveBeenCalled();
    expect(canManage).not.toHaveBeenCalled();
  });

  it('requires event management permission only for event admin routes', async () => {
    auth.isAuthenticated.mockReturnValue(true);
    canManage.mockResolvedValue(false);
    const result = await run();
    if (guard === eventAdminGuard) {
      expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/dashboard/events');
      expect(canManage).toHaveBeenCalledOnce();
    } else {
      expect(result).toBe(true);
      expect(canManage).not.toHaveBeenCalled();
    }
  });
});

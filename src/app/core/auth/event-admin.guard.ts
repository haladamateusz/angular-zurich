import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../data-access/supabase/supabase.service';
import { AuthService } from './auth.service';

export const eventAdminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const supabaseService = inject(SupabaseService);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  return (async () => {
    if (!isBrowser) {
      return true;
    }

    await authService.waitUntilInitialized();

    if (!authService.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }

    return (await supabaseService.canCurrentUserManageEvents())
      ? true
      : router.createUrlTree(['/dashboard/events']);
  })();
};

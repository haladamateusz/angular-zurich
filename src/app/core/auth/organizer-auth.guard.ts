import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const organizerAuthGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  return (async () => {
    if (!isBrowser) {
      return true;
    }

    await authService.waitUntilInitialized();

    return authService.isAuthenticated() ? true : router.createUrlTree(['/login']);
  })();
};

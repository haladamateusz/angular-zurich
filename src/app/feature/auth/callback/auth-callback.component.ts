import {
  Component,
  PLATFORM_ID,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-auth-callback',
  template: `
    <section
      class="mx-auto flex min-h-[calc(100vh-12rem)] max-w-2xl items-center justify-center px-6 py-16"
    >
      <div
        class="w-full rounded-surface border border-navbar-line bg-navbar px-8 py-10 text-center"
      >
        <p class="text-sm font-semibold text-primary-text">Google sign-in</p>
        <h1 class="mt-4 text-3xl font-display font-semibold tracking-[-0.04em] text-foreground">
          Finishing sign-in
        </h1>
        <p class="mt-4 text-base leading-7 text-foreground/75">
          {{ statusMessage() }}
        </p>
      </div>
    </section>
  `,
})
export class AuthCallbackComponent {
  private readonly authService = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly router = inject(Router);

  protected readonly statusMessage = signal('Please wait while we complete your Google sign-in.');

  constructor() {
    afterNextRender(() => {
      if (!this.isBrowser) {
        return;
      }

      void this.completeSignIn();
    });
  }

  private async completeSignIn(): Promise<void> {
    const result = await this.authService.completeGoogleSignIn();

    if (result === 'success') {
      await this.router.navigateByUrl('/');
      return;
    }

    this.statusMessage.set(
      result === 'unauthorized'
        ? 'This Google account is not authorized. Redirecting you back to login.'
        : 'We could not complete sign-in. Redirecting you back to login.',
    );

    await this.router.navigate(['/login'], {
      queryParams: {
        error: result === 'unauthorized' ? 'access-denied' : 'auth-failed',
        reason: this.authService.getDebugErrorMessage() ?? undefined,
      },
    });
  }
}

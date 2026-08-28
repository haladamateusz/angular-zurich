import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  'access-denied': 'This Google account is not authorized for organizer access.',
  'auth-failed': 'We could not complete sign-in. Please try again.',
};

@Component({
  selector: 'app-login',
  template: `
    <section class="mx-auto flex min-h-[calc(100vh-12rem)] max-w-3xl items-center px-6 py-16">
      <div
        class="login-card w-full rounded-surface border border-card-line bg-card px-8 py-10 sm:px-10"
      >
        <p class="relative z-[1] text-sm font-bold text-primary-text">
          Organizer access
        </p>
        <h1
          class="relative z-[1] mt-4 text-4xl font-display font-semibold tracking-[-0.04em] text-foreground"
        >
          Sign in with an approved Google account
        </h1>
        <p class="relative z-[1] mt-4 max-w-2xl text-base leading-7 text-foreground/75">
          If your account is not on the allowlist, sign-in will be rejected automatically.
        </p>

        @if (errorMessage()) {
          <div
            class="mt-6 rounded-surface border border-primary/25 bg-primary/8 px-4 py-3 text-sm text-foreground"
            role="alert"
            aria-live="polite"
          >
            {{ errorMessage() }}
          </div>
        }

        <div class="relative z-[1] mt-8">
          <button
            type="button"
            (click)="signInWithGoogle()"
            class="app-button app-button--block"
            [disabled]="isSubmitting()"
            aria-label="Sign in with Google"
          >
            {{ isSubmitting() ? 'Redirecting…' : 'Sign in' }}
          </button>
        </div>
      </div>
    </section>
  `,
  styles: `
    .login-card {
      position: relative;
      overflow: hidden;
      background: var(--color-card);
    }
  `,
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal(this.resolveErrorMessage());

  protected async signInWithGoogle(): Promise<void> {
    this.errorMessage.set(null);
    this.isSubmitting.set(true);

    try {
      await this.authService.signInWithGoogle();
    } catch {
      this.errorMessage.set(
        this.authService.consumeErrorMessage() ?? LOGIN_ERROR_MESSAGES['auth-failed'],
      );
      this.isSubmitting.set(false);
    }
  }

  private resolveErrorMessage(): string | null {
    const errorCode = this.route.snapshot.queryParamMap.get('error');
    const errorReason = this.route.snapshot.queryParamMap.get('reason');

    if (errorReason) {
      return `${LOGIN_ERROR_MESSAGES[errorCode ?? 'auth-failed'] ?? LOGIN_ERROR_MESSAGES['auth-failed']} (${errorReason})`;
    }

    if (errorCode === null) {
      return null;
    }

    return LOGIN_ERROR_MESSAGES[errorCode] ?? LOGIN_ERROR_MESSAGES['auth-failed'];
  }
}

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
        class="login-card w-full rounded-[2rem] border border-card-line bg-card px-8 py-10 shadow-sm sm:px-10"
      >
        <p class="relative z-[1] text-sm font-semibold uppercase tracking-[0.28em] text-primary">
          Organizer access
        </p>
        <h1 class="relative z-[1] mt-4 text-4xl font-inter-tight font-semibold tracking-[-0.04em] text-foreground">
          Sign in with an approved Google account
        </h1>
        <p class="relative z-[1] mt-4 max-w-2xl text-base leading-7 text-foreground/75">
          If your account is not on the
          allowlist, sign-in will be rejected automatically.
        </p>

        @if (errorMessage()) {
          <div
            class="mt-6 rounded-2xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm text-foreground"
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
            class="inline-flex w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
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
      background: color-mix(in srgb, white 96%, var(--color-card) 4%);
      box-shadow:
        inset 0 1px 0 color-mix(in srgb, white 55%, transparent),
        0 8px 18px color-mix(in srgb, black 3%, transparent);
    }

    .login-card::before {
      content: '';
      position: absolute;
      inset: 0 0 auto;
      height: 1px;
      background:
        linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in srgb, var(--color-border) 55%, transparent) 24%,
          color-mix(in srgb, white 28%, transparent) 50%,
          transparent 100%
        );
      pointer-events: none;
    }

    :host-context(.dark) .login-card {
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--color-primary) 8%, transparent), transparent 34%),
        linear-gradient(180deg, color-mix(in srgb, white 1.5%, var(--color-card)) 0%, var(--color-card) 100%);
      box-shadow:
        inset 0 1px 0 color-mix(in srgb, white 4%, transparent),
        0 18px 40px color-mix(in srgb, black 8%, transparent);
    }

    :host-context(.dark) .login-card::before {
      background:
        linear-gradient(
          90deg,
          transparent 0%,
          color-mix(in srgb, var(--color-primary) 42%, transparent) 18%,
          color-mix(in srgb, white 18%, transparent) 52%,
          transparent 100%
        );
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

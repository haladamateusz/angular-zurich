import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  'access-denied': 'This Google account is not authorized for organizer access.',
  'auth-failed': 'We could not complete sign-in. Please try again.',
};

@Component({
  selector: 'app-login',
  imports: [RouterLink],
  template: `
    <section class="mx-auto flex min-h-[calc(100vh-12rem)] max-w-3xl items-center px-6 py-16">
      <div
        class="w-full rounded-[2rem] border border-navbar-line bg-navbar px-8 py-10 shadow-[0_24px_80px_-40px_rgba(15,23,42,0.45)] sm:px-10"
      >
        <p class="text-sm font-semibold uppercase tracking-[0.28em] text-primary">
          Organizer access
        </p>
        <h1 class="mt-4 text-4xl font-inter-tight font-semibold tracking-[-0.04em] text-foreground">
          Sign in with an approved Google account
        </h1>
        <p class="mt-4 max-w-2xl text-base leading-7 text-foreground/75">
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

        <div class="mt-8 flex flex-wrap items-center gap-4">
          <button
            type="button"
            (click)="signInWithGoogle()"
            class="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold text-primary transition hover:bg-primary/10 focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70"
            [disabled]="isSubmitting()"
            aria-label="Sign in with Google"
          >
            {{ isSubmitting() ? 'Redirecting…' : 'Sign in' }}
          </button>
          <a
            routerLink="/"
            class="inline-flex items-center justify-center rounded-lg border border-primary/20 bg-background px-6 py-3 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 focus:outline-hidden focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 focus:ring-offset-background"
          >
            Back to home
          </a>
        </div>
      </div>
    </section>
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

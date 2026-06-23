import { DestroyRef, Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Session, SupabaseClient, User, createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

const GENERIC_AUTH_ERROR_MESSAGE = 'We could not complete sign-in. Please try again.';
const UNAUTHORIZED_AUTH_ERROR_MESSAGE =
  'This Google account is not authorized for organizer access.';

interface UserProfileSummary {
  avatarUrl: string | null;
  displayName: string;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly sessionState = signal<Session | null>(null);
  private readonly initializedState = signal(false);
  private readonly errorMessageState = signal<string | null>(null);
  private readonly supabase = this.createSupabaseClient();

  readonly session = computed(() => this.sessionState());
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isInitialized = computed(() => this.initializedState());
  readonly userProfile = computed<UserProfileSummary | null>(() => {
    const user = this.user();

    if (user === null) {
      return null;
    }

    return {
      avatarUrl: this.getAvatarUrl(user),
      displayName: this.getDisplayName(user),
    };
  });

  getDebugErrorMessage(): string | null {
    return this.errorMessageState();
  }

  constructor() {
    if (!this.isBrowser || this.supabase === null) {
      this.initializedState.set(true);
      return;
    }

    void this.initializeSession();
  }

  async signInWithGoogle(): Promise<void> {
    this.errorMessageState.set(null);

    if (!this.isBrowser || this.supabase === null) {
      this.errorMessageState.set(GENERIC_AUTH_ERROR_MESSAGE);
      throw new Error('supabase_auth_not_configured');
    }

    const redirectTo = new URL('/auth/callback', this.getAppUrl()).toString();
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });

    if (error) {
      this.errorMessageState.set(this.toUserFacingError(error.message));
      throw error;
    }
  }

  async signOut(): Promise<void> {
    if (this.supabase === null) {
      return;
    }

    const { error } = await this.supabase.auth.signOut();

    if (error) {
      throw error;
    }
  }

  async completeGoogleSignIn(): Promise<'success' | 'unauthorized' | 'error'> {
    if (!this.isBrowser || this.supabase === null) {
      this.errorMessageState.set(GENERIC_AUTH_ERROR_MESSAGE);
      return 'error';
    }

    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const providerError =
      searchParams.get('error_description') ?? hashParams.get('error_description');

    if (providerError) {
      return this.setErrorResult(providerError);
    }

    const authorizationCode = searchParams.get('code');

    if (authorizationCode) {
      try {
        const { data, error } = await this.supabase.auth.exchangeCodeForSession(authorizationCode);

        if (error || data.session === null) {
          return this.setErrorResult(error?.message ?? GENERIC_AUTH_ERROR_MESSAGE);
        }

        this.sessionState.set(data.session);
        this.errorMessageState.set(null);
        window.history.replaceState({}, document.title, window.location.pathname);

        return 'success';
      } catch (error) {
        const message = error instanceof Error ? error.message : GENERIC_AUTH_ERROR_MESSAGE;
        return this.setErrorResult(message);
      }
    }

    const { data, error } = await this.supabase.auth.getSession();

    if (error || data.session === null) {
      return this.setErrorResult(error?.message ?? GENERIC_AUTH_ERROR_MESSAGE);
    }

    this.sessionState.set(data.session);
    this.errorMessageState.set(null);

    return 'success';
  }

  consumeErrorMessage(): string | null {
    const message = this.errorMessageState();
    this.errorMessageState.set(null);
    return message;
  }

  async waitUntilInitialized(): Promise<void> {
    if (this.isInitialized()) {
      return;
    }

    await new Promise<void>((resolve) => {
      const intervalId = window.setInterval(() => {
        if (!this.isInitialized()) {
          return;
        }

        window.clearInterval(intervalId);
        resolve();
      }, 16);
    });
  }

  private createSupabaseClient(): SupabaseClient | null {
    const supabaseUrl = environment.supabaseUrl.trim();
    const supabaseKey = environment.supabaseKey.trim();

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: this.isBrowser,
        autoRefreshToken: this.isBrowser,
      },
    });
  }

  private getAppUrl(): string {
    return environment.appUrl.trim() || window.location.origin;
  }

  private async initializeSession(): Promise<void> {
    if (this.supabase === null) {
      this.initializedState.set(true);
      return;
    }

    const { data } = await this.supabase.auth.getSession();

    if (this.destroyRef.destroyed) {
      return;
    }

    this.sessionState.set(data.session);
    this.initializedState.set(true);

    const {
      data: { subscription },
    } = this.supabase.auth.onAuthStateChange((_, session) => {
      this.sessionState.set(session);
      this.initializedState.set(true);
    });

    this.destroyRef.onDestroy(() => {
      subscription.unsubscribe();
    });
  }

  private setErrorResult(message: string): 'unauthorized' | 'error' {
    const normalizedMessage = this.toUserFacingError(message);
    this.sessionState.set(null);
    this.errorMessageState.set(normalizedMessage);

    return normalizedMessage === UNAUTHORIZED_AUTH_ERROR_MESSAGE ? 'unauthorized' : 'error';
  }

  private toUserFacingError(message: string): string {
    return /restricted|not authorized|not allowed|unauthorized|403/i.test(message)
      ? UNAUTHORIZED_AUTH_ERROR_MESSAGE
      : GENERIC_AUTH_ERROR_MESSAGE;
  }

  private getAvatarUrl(user: User): string | null {
    const rawAvatarUrl = user.user_metadata['avatar_url'];

    return typeof rawAvatarUrl === 'string' && rawAvatarUrl.trim().length > 0
      ? rawAvatarUrl
      : null;
  }

  private getDisplayName(user: User): string {
    const candidateNames = [
      user.user_metadata['full_name'],
      user.user_metadata['name'],
      user.user_metadata['user_name'],
      user.email,
    ];

    const resolvedName = candidateNames.find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );

    return resolvedName ?? 'Organizer';
  }
}

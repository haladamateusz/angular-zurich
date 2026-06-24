import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID, Service, inject } from '@angular/core';

const STORAGE_KEY = 'angular-zurich-talk-submission-edit-tokens';

@Service()
export class TalkSubmissionDeviceAuthService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  storeEditToken(submissionId: string, editToken: string): void {
    if (!this.isBrowser || !submissionId || !editToken) {
      return;
    }

    const tokens = this.readTokens();

    tokens[submissionId] = editToken;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
  }

  getEditToken(submissionId: string | null): string | null {
    if (!this.isBrowser || !submissionId) {
      return null;
    }

    return this.readTokens()[submissionId] ?? null;
  }

  hasEditToken(submissionId: string | null): boolean {
    return this.getEditToken(submissionId) !== null;
  }

  private readTokens(): Record<string, string> {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return {};
    }

    try {
      const parsedValue = JSON.parse(rawValue);

      return this.isTokenMap(parsedValue) ? parsedValue : {};
    } catch {
      return {};
    }
  }

  private isTokenMap(value: unknown): value is Record<string, string> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return false;
    }

    return Object.values(value).every((token) => typeof token === 'string');
  }
}

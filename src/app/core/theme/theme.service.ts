import { DOCUMENT, Injectable, afterNextRender, computed, inject, signal } from '@angular/core';

const STORAGE_KEY = 'theme-dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);

  readonly dark = signal(false);
  readonly turnstileTheme = computed<'light' | 'dark'>(() => (this.dark() ? 'dark' : 'light'));

  constructor() {
    afterNextRender(() => this.applyStoredPreference());
  }

  toggle(): void {
    const next = !this.dark();
    this.dark.set(next);
    this.doc.documentElement.classList.toggle('dark', next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  private applyStoredPreference(): void {
    const stored = localStorage.getItem(STORAGE_KEY);
    const prefersDark =
      stored === 'true' ||
      (stored === null && window.matchMedia('(prefers-color-scheme: dark)').matches);

    this.dark.set(prefersDark);
    this.doc.documentElement.classList.toggle('dark', prefersDark);
  }
}

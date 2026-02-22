import { Component, signal, inject, DOCUMENT, afterNextRender } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeroComponent } from './core/hero/hero.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeroComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('angular-zurich');
  protected readonly dark = signal(false);

  private doc = inject(DOCUMENT);

  constructor() {
    afterNextRender(() => {
      const stored = localStorage.getItem('theme-dark');
      const prefersDark = stored
        ? stored === 'true'
        : window.matchMedia('(prefers-color-scheme: dark)').matches;

      if (prefersDark) {
        this.dark.set(true);
        this.doc.documentElement.classList.add('dark');
      }
    });
  }

  protected toggleDarkMode(): void {
    const next = !this.dark();
    this.dark.set(next);
    this.doc.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme-dark', String(next));
  }
}

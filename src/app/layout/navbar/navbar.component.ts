import { ChangeDetectionStrategy, Component, signal, inject, DOCUMENT, afterNextRender } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavbarComponent {
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

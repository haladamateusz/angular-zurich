import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { DashboardSectionNavComponent } from './dashboard-section-nav.component';

@Component({
  selector: 'app-dashboard-shell',
  imports: [DashboardSectionNavComponent, RouterOutlet],
  template: `
    <section class="mx-auto max-w-6xl px-6 py-16 sm:px-8 lg:px-10">
      @if (showSectionNavigation()) {
        <app-dashboard-section-nav />
      }

      <router-outlet />
    </section>
  `,
})
export class DashboardShellComponent {
  private readonly router = inject(Router);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
      startWith(this.router.url),
    ),
    { initialValue: this.router.url },
  );

  protected readonly showSectionNavigation = computed(() => {
    const url = this.currentUrl().split('?')[0];

    return url === '/dashboard/talk-submissions' || url === '/dashboard/events';
  });
}

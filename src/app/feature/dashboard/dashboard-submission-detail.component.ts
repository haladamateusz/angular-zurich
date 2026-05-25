import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

@Component({
  selector: 'app-dashboard-submission-detail',
  imports: [RouterLink],
  template: `
    <section class="mx-auto max-w-4xl px-6 py-16 sm:px-8 lg:px-10">
      <div class="rounded-[2rem] border border-navbar-line bg-card px-8 py-8 shadow-[0_24px_60px_-40px_rgba(15,23,42,0.42)]">
        <p class="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Submission details</p>
        <h1 class="mt-4 text-3xl font-inter-tight font-semibold tracking-[-0.03em] text-foreground">
          Submission {{ submissionId }}
        </h1>
        <p class="mt-4 max-w-2xl text-base leading-7 text-foreground/75">
          The detailed organizer review view is ready for the next pass. For now, use the dashboard table as the primary queue.
        </p>

        <a
          routerLink="/dashboard"
          class="mt-8 inline-flex items-center justify-center rounded-lg border border-primary/20 bg-background px-5 py-3 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/10 focus:outline-hidden focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 focus:ring-offset-background"
        >
          Back to dashboard
        </a>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardSubmissionDetailComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly submissionId = this.route.snapshot.paramMap.get('submissionId') ?? '';
}

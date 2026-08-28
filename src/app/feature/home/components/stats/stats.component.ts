import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
} from '@angular/core';
import {
  StatsCounts,
  SupabaseService,
} from '../../../../core/data-access/supabase/supabase.service';
import { HOME_STATE_KEYS } from '../../data-access/home-state.keys';
import { HomeTransferStateService } from '../../data-access/home-transfer-state.service';

interface Stat {
  value: number;
  label: string;
}

const COUNT_ANIMATION_DURATION = 700;

const EMPTY_STATS: StatsCounts = {
  talks: 0,
  speakers: 0,
  events: 0,
};

@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css',
})
export class StatsComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly view = this.document.defaultView;
  private readonly supabaseService = inject(SupabaseService);
  private readonly homeTransferState = inject(HomeTransferStateService);
  private readonly hasEnteredViewport = signal(
    !this.view || typeof this.view.IntersectionObserver !== 'function',
  );
  private readonly statsLoaded = signal(false);
  private readonly countProgress = signal(0);
  private animationFrameId: number | null = null;

  private readonly statsCounts = resource<StatsCounts, void>({
    defaultValue: EMPTY_STATS,
    loader: async () => {
      const counts = await this.homeTransferState.load(HOME_STATE_KEYS.stats, () =>
        this.supabaseService.getStatsCounts(),
      );

      this.statsLoaded.set(true);
      this.startCountAnimationIfReady();
      return counts;
    },
  });

  private readonly startStatsWhenReady = effect(() => {
    const status = this.statsCounts.status();
    const statsAreReady = this.statsLoaded() || status === 'resolved' || status === 'local';
    if (this.hasReachedViewport() && statsAreReady) {
      untracked(() => this.startCountAnimation());
    }
  });

  protected readonly stats = computed<Stat[]>(() => {
    const counts = this.statsCounts.value();
    const progress = this.countProgress();

    return [
      { value: Math.round(counts.talks * progress), label: 'Talks' },
      { value: Math.round(counts.speakers * progress), label: 'Speakers' },
      { value: Math.round(counts.events * progress), label: 'Events' },
    ];
  });

  constructor() {
    this.observeViewport();
    this.destroyRef.onDestroy(() => {
      this.cancelCountAnimation();
      this.viewportObserver?.disconnect();
    });
  }

  private viewportObserver: IntersectionObserver | null = null;

  private observeViewport(): void {
    if (!this.isBrowser) {
      return;
    }

    if (!this.view || typeof this.view.IntersectionObserver !== 'function') {
      this.hasEnteredViewport.set(true);
      this.startCountAnimationIfReady();
      return;
    }

    const view = this.view;
    this.viewportObserver = new view.IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }

        this.hasEnteredViewport.set(true);
        this.startCountAnimationIfReady();
        this.viewportObserver?.disconnect();
        this.viewportObserver = null;
      },
      { threshold: 0.35 },
    );

    this.viewportObserver.observe(this.hostElement.nativeElement);
  }

  private startCountAnimationIfReady(): void {
    const status = this.statsCounts.status();
    const statsAreReady = this.statsLoaded() || status === 'resolved' || status === 'local';

    if (this.hasReachedViewport() && statsAreReady) {
      this.startCountAnimation();
    }
  }

  private hasReachedViewport(): boolean {
    if (this.hasEnteredViewport()) {
      return true;
    }

    if (this.isBrowser && (!this.view || typeof this.view.IntersectionObserver !== 'function')) {
      this.hasEnteredViewport.set(true);
      return true;
    }

    return false;
  }

  private startCountAnimation(): void {
    if (this.animationFrameId !== null || this.countProgress() >= 1) {
      return;
    }

    if (
      !this.isBrowser ||
      !this.view ||
      typeof this.view.requestAnimationFrame !== 'function' ||
      this.view.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      this.countProgress.set(1);
      return;
    }

    const view = this.view;
    const startedAt = view.performance.now();
    const tick = (timestamp: number) => {
      const elapsed = Math.min(1, (timestamp - startedAt) / COUNT_ANIMATION_DURATION);
      const easedProgress = 1 - Math.pow(1 - elapsed, 3);

      this.countProgress.set(easedProgress);

      if (elapsed >= 1) {
        this.animationFrameId = null;
        this.countProgress.set(1);
        return;
      }

      this.animationFrameId = view.requestAnimationFrame(tick);
    };

    this.countProgress.set(0);
    this.animationFrameId = view.requestAnimationFrame(tick);
  }

  private cancelCountAnimation(): void {
    if (
      this.animationFrameId === null ||
      !this.view ||
      typeof this.view.cancelAnimationFrame !== 'function'
    ) {
      return;
    }

    this.view.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }
}

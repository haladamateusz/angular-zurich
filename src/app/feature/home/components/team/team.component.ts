import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { SupabaseService } from '../../../../core/data-access/supabase/supabase.service';
import { Person } from '../../../../core/models/person.interface';
import { HOME_STATE_KEYS } from '../../data-access/home-state.keys';
import { HomeTransferStateService } from '../../data-access/home-transfer-state.service';

const CARD_REVEAL_THRESHOLD = 0.5;
const CARD_REVEAL_VISIBLE_HEIGHT_CAP = 200;

@Component({
  selector: 'app-team',
  templateUrl: './team.component.html',
  styleUrl: './team.component.css',
})
export class TeamComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly view = this.document.defaultView;
  private readonly supabaseService = inject(SupabaseService);
  private readonly homeTransferState = inject(HomeTransferStateService);
  private readonly currentCardsHaveEnteredViewport = signal(!this.isBrowser || !this.view);
  private readonly archiveCardsHaveEnteredViewport = signal(!this.isBrowser || !this.view);

  protected readonly currentCardsRevealPending = computed(
    () => this.isBrowser && !this.currentCardsHaveEnteredViewport(),
  );
  protected readonly currentCardsRevealActive = computed(
    () => this.isBrowser && this.currentCardsHaveEnteredViewport(),
  );
  protected readonly archiveCardsRevealPending = computed(
    () => this.isBrowser && !this.archiveCardsHaveEnteredViewport(),
  );
  protected readonly archiveCardsRevealActive = computed(
    () => this.isBrowser && this.archiveCardsHaveEnteredViewport(),
  );

  protected readonly organizersResource = resource<Person[], void>({
    defaultValue: [],
    loader: () =>
      this.homeTransferState.load(HOME_STATE_KEYS.organizers, async () => {
        const { data, error } = await this.supabaseService.getOrganizers();

        if (error) throw error;
        return data ?? [];
      }),
  });

  protected readonly formerOrganizersResource = resource<Person[], void>({
    defaultValue: [],
    loader: () =>
      this.homeTransferState.load(HOME_STATE_KEYS.formerOrganizers, async () => {
        const { data, error } = await this.supabaseService.getFormerOrganizers();

        if (error) throw error;
        return data ?? [];
      }),
  });

  protected retryOrganizers(): void {
    this.organizersResource.reload();
  }

  protected retryFormerOrganizers(): void {
    this.formerOrganizersResource.reload();
  }

  private currentViewportObserver: IntersectionObserver | null = null;
  private archiveViewportObserver: IntersectionObserver | null = null;
  private currentViewportFallbackCleanup: (() => void) | null = null;
  private archiveViewportFallbackCleanup: (() => void) | null = null;

  constructor() {
    afterNextRender({
      read: () => {
        this.observeCurrentCardsViewport();
        this.observeArchiveCardsViewport();
      },
    });
    this.destroyRef.onDestroy(() => {
      this.currentViewportObserver?.disconnect();
      this.archiveViewportObserver?.disconnect();
      this.currentViewportFallbackCleanup?.();
      this.archiveViewportFallbackCleanup?.();
    });
  }

  private observeCurrentCardsViewport(): void {
    this.observeViewport(
      '.team__column--current .team__grid',
      () => this.currentCardsHaveEnteredViewport.set(true),
      (observer) => (this.currentViewportObserver = observer),
      (cleanup) => (this.currentViewportFallbackCleanup = cleanup),
    );
  }

  private observeArchiveCardsViewport(): void {
    this.observeViewport(
      '.team__column--archive .team__grid',
      () => this.archiveCardsHaveEnteredViewport.set(true),
      (observer) => (this.archiveViewportObserver = observer),
      (cleanup) => (this.archiveViewportFallbackCleanup = cleanup),
    );
  }

  private observeViewport(
    selector: string,
    markAsEntered: () => void,
    setObserver: (observer: IntersectionObserver | null) => void,
    setFallbackCleanup: (cleanup: (() => void) | null) => void,
  ): void {
    if (!this.isBrowser || !this.view) {
      return;
    }

    const view = this.view;
    const revealTarget =
      (this.hostElement.nativeElement.querySelector(selector) as HTMLElement | null) ??
      this.hostElement.nativeElement;
    if (typeof view.IntersectionObserver !== 'function') {
      const checkViewport = () => {
        const bounds = revealTarget.getBoundingClientRect();
        const viewportHeight = view.innerHeight || this.document.documentElement.clientHeight;
        const visibleHeight = Math.min(bounds.bottom, viewportHeight) - Math.max(bounds.top, 0);
        const visibilityRatio = bounds.height > 0 ? visibleHeight / bounds.height : 0;

        if (visibilityRatio < this.getRevealThreshold(revealTarget)) {
          return;
        }

        markAsEntered();
        cleanup();
        setFallbackCleanup(null);
      };

      const cleanup = () => {
        view.removeEventListener('scroll', checkViewport);
        view.removeEventListener('resize', checkViewport);
      };
      view.addEventListener('scroll', checkViewport, { passive: true });
      view.addEventListener('resize', checkViewport);
      setFallbackCleanup(cleanup);
      checkViewport();
      return;
    }

    const revealThreshold = this.getRevealThreshold(revealTarget);
    const observer = new view.IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || entry.intersectionRatio < revealThreshold) {
          return;
        }

        markAsEntered();
        observer.disconnect();
        setObserver(null);
      },
      { threshold: revealThreshold },
    );

    setObserver(observer);
    observer.observe(revealTarget);
  }

  private getRevealThreshold(revealTarget: HTMLElement): number {
    const targetHeight = revealTarget.getBoundingClientRect().height;

    if (!targetHeight) {
      return CARD_REVEAL_THRESHOLD;
    }

    return Math.min(CARD_REVEAL_THRESHOLD, CARD_REVEAL_VISIBLE_HEIGHT_CAP / targetHeight);
  }
}

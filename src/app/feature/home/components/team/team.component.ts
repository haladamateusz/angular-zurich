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
const CARD_REVEAL_INITIAL_DELAY = 80;
const CARD_REVEAL_STAGGER = 70;
const ARCHIVE_REVEAL_SETTLE_DELAY = 320;

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
  private readonly hasEnteredViewport = signal(!this.isBrowser || !this.view);

  protected readonly cardsRevealPending = computed(
    () => this.isBrowser && !this.hasEnteredViewport(),
  );
  protected readonly cardsRevealActive = computed(
    () => this.isBrowser && this.hasEnteredViewport(),
  );
  protected readonly archiveRevealStartDelay = computed(() => {
    const organizerCount = this.organizersResource.value().length;

    if (!organizerCount) {
      return CARD_REVEAL_INITIAL_DELAY;
    }

    return (
      CARD_REVEAL_INITIAL_DELAY +
      (organizerCount - 1) * CARD_REVEAL_STAGGER +
      ARCHIVE_REVEAL_SETTLE_DELAY
    );
  });

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

  private viewportObserver: IntersectionObserver | null = null;
  private viewportFallbackCleanup: (() => void) | null = null;

  constructor() {
    afterNextRender({ read: () => this.observeViewport() });
    this.destroyRef.onDestroy(() => {
      this.viewportObserver?.disconnect();
      this.viewportFallbackCleanup?.();
    });
  }

  private observeViewport(): void {
    if (!this.isBrowser || !this.view) {
      return;
    }

    const view = this.view;
    const revealTarget =
      (this.hostElement.nativeElement.querySelector('.team__grid') as HTMLElement | null) ??
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

        this.hasEnteredViewport.set(true);
        this.viewportFallbackCleanup?.();
        this.viewportFallbackCleanup = null;
      };

      view.addEventListener('scroll', checkViewport, { passive: true });
      view.addEventListener('resize', checkViewport);
      this.viewportFallbackCleanup = () => {
        view.removeEventListener('scroll', checkViewport);
        view.removeEventListener('resize', checkViewport);
      };
      checkViewport();
      return;
    }

    const revealThreshold = this.getRevealThreshold(revealTarget);
    this.viewportObserver = new view.IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || entry.intersectionRatio < revealThreshold) {
          return;
        }

        this.hasEnteredViewport.set(true);
        this.viewportObserver?.disconnect();
        this.viewportObserver = null;
      },
      { threshold: revealThreshold },
    );

    this.viewportObserver.observe(revealTarget);
  }

  private getRevealThreshold(revealTarget: HTMLElement): number {
    const targetHeight = revealTarget.getBoundingClientRect().height;

    if (!targetHeight) {
      return CARD_REVEAL_THRESHOLD;
    }

    return Math.min(CARD_REVEAL_THRESHOLD, CARD_REVEAL_VISIBLE_HEIGHT_CAP / targetHeight);
  }
}

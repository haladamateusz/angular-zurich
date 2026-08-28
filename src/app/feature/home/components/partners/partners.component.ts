import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Sponsor } from '../../../../core/models/sponsor.interface';
import { PartnerTrackingUrlPipe } from './partner-tracking-url.pipe';

const CARD_REVEAL_THRESHOLD = 0.5;
const CARD_REVEAL_VISIBLE_HEIGHT_CAP = 200;

@Component({
  selector: 'app-partners',
  imports: [PartnerTrackingUrlPipe],
  templateUrl: './partners.component.html',
  styleUrl: './partners.component.css'
})
export class PartnersComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly view = this.document.defaultView;
  private readonly hasEnteredViewport = signal(!this.isBrowser || !this.view);

  protected readonly cardsRevealPending = computed(
    () => this.isBrowser && !this.hasEnteredViewport(),
  );
  protected readonly cardsRevealActive = computed(
    () => this.isBrowser && this.hasEnteredViewport(),
  );

  readonly partners = input.required<Sponsor[]>();

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
      (this.hostElement.nativeElement.querySelector('.partners__grid') as HTMLElement | null) ??
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

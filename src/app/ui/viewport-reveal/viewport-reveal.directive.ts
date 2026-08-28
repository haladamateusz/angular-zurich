import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  afterNextRender,
  computed,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
} from '@angular/core';

const MOBILE_BREAKPOINT = 768;

type ViewportRevealMode = 'immediate' | 'desktop-immediate' | 'viewport';

@Directive({
  selector: '[appViewportReveal]',
  host: {
    '[class.viewport-reveal--pending]': 'isPending()',
    '[class.viewport-reveal--active]': 'isActive()',
  },
})
export class ViewportRevealDirective {
  readonly revealMode = input<ViewportRevealMode>('desktop-immediate', {
    alias: 'appViewportReveal',
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  private readonly element = inject(ElementRef<HTMLElement>);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly view = this.document.defaultView;
  private readonly isRevealEnabled = signal(this.isBrowser);
  private readonly hasEnteredViewport = signal(!this.isBrowser);

  readonly isPending = computed(() => this.isRevealEnabled() && !this.hasEnteredViewport());
  readonly isActive = computed(() => this.isRevealEnabled() && this.hasEnteredViewport());

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

    this.isRevealEnabled.set(true);

    if (this.revealsImmediately()) {
      this.hasEnteredViewport.set(true);
      return;
    }

    this.hasEnteredViewport.set(false);

    const view = this.view;
    const revealTarget = this.element.nativeElement;

    if (typeof view.IntersectionObserver !== 'function') {
      const checkViewport = () => {
        const bounds = revealTarget.getBoundingClientRect();
        const viewportHeight = view.innerHeight || this.document.documentElement.clientHeight;

        if (bounds.top >= viewportHeight || bounds.bottom <= 0) {
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

    this.viewportObserver = new view.IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) {
          return;
        }

        this.hasEnteredViewport.set(true);
        this.viewportObserver?.disconnect();
        this.viewportObserver = null;
      },
      { threshold: 0 },
    );

    this.viewportObserver.observe(revealTarget);
  }

  private revealsImmediately(): boolean {
    return this.revealMode() === 'immediate' ||
      (this.revealMode() === 'desktop-immediate' && !this.isMobile());
  }

  private isMobile(): boolean {
    if (!this.view) {
      return false;
    }

    return typeof this.view.matchMedia === 'function'
      ? this.view.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches
      : this.view.innerWidth < MOBILE_BREAKPOINT;
  }
}

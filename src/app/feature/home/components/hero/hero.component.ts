import { DOCUMENT } from '@angular/common';
import {
  Component,
  afterNextRender,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Event } from '../../../../core/models/event.interface';
import { Sponsor } from '../../../../core/models/sponsor.interface';
import { EventDateFormatPipe } from '../../../../core/pipes/date-format/event-date-format.pipe';

const EVENT_PREVIEW_ENTER_ANIMATION = 'event-preview-enter';
const SOLO_HERO_ENTER_ANIMATION = 'hero-intro-reveal';
const HERO_INTRO_FALLBACK_MS = 750;

@Component({
  selector: 'app-hero',
  imports: [EventDateFormatPipe, RouterLink],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.css',
})
export class HeroComponent {
  readonly sponsors = input.required<Sponsor[]>();
  readonly sponsorsLoading = input(false);
  readonly sponsorsLoadFailed = input(false);
  readonly eventLoading = input(false);
  readonly event = input<Event | null>(null);
  readonly retrySponsors = output<void>();
  readonly introCompleted = output<void>();

  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly view = this.document.defaultView;
  private readonly hasRendered = signal(false);
  private introHasCompleted = false;
  private introCompletionFallback: number | null = null;
  protected readonly animateHeroIntro = computed(() => this.hasRendered());
  protected readonly animateEventContent = computed(() => this.hasRendered() && !!this.event());
  protected readonly usesSoloLayout = computed(() => !this.event() && !this.eventLoading());

  protected readonly previewTalks = computed(() =>
    (this.event()?.talks ?? []).slice(0, 3).map((talk) => {
      const speaker = talk.speaker_links.find((link) => link.speaker)?.speaker ?? null;
      const firstName = speaker?.first_name?.trim() ?? '';
      const lastName = speaker?.last_name?.trim() ?? '';
      const speakerName = `${firstName} ${lastName}`.trim() || 'Angular Zürich speaker';
      const initials =
        `${firstName.charAt(0)}${lastName.charAt(0)}`.trim() || speakerName.charAt(0).toUpperCase();

      return {
        id: talk.id,
        title: talk.title,
        speakerName,
        speakerImage: speaker?.picture_url ?? null,
        initials,
      };
    }),
  );

  constructor() {
    afterNextRender({
      write: () => {
        this.hasRendered.set(true);

        if (this.prefersReducedMotion()) {
          this.markIntroCompleted();
          return;
        }

        this.scheduleIntroCompletionFallback();
      },
    });
    this.destroyRef.onDestroy(() => this.cancelIntroCompletionFallback());
  }

  protected completeIntro(event: AnimationEvent): void {
    if (
      event.target !== event.currentTarget ||
      event.animationName !== EVENT_PREVIEW_ENTER_ANIMATION
    ) {
      return;
    }

    this.markIntroCompleted();
  }

  protected completeSoloIntro(event: AnimationEvent): void {
    if (event.target !== event.currentTarget || event.animationName !== SOLO_HERO_ENTER_ANIMATION) {
      return;
    }

    this.markIntroCompleted();
  }

  private prefersReducedMotion(): boolean {
    return (
      this.document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    );
  }

  private markIntroCompleted(): void {
    if (this.introHasCompleted) {
      return;
    }

    this.introHasCompleted = true;
    this.cancelIntroCompletionFallback();
    this.introCompleted.emit();
  }

  private scheduleIntroCompletionFallback(): void {
    if (!this.view || this.introCompletionFallback !== null) {
      return;
    }

    this.introCompletionFallback = this.view.setTimeout(() => {
      this.introCompletionFallback = null;
      this.markIntroCompleted();
    }, HERO_INTRO_FALLBACK_MS);
  }

  private cancelIntroCompletionFallback(): void {
    if (this.introCompletionFallback === null || !this.view) {
      return;
    }

    this.view.clearTimeout(this.introCompletionFallback);
    this.introCompletionFallback = null;
  }
}

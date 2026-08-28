import { Component, afterNextRender, computed, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Event } from '../../../../core/models/event.interface';
import { Sponsor } from '../../../../core/models/sponsor.interface';
import { EventDateFormatPipe } from '../../../../core/pipes/date-format/event-date-format.pipe';

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

  private readonly hasRendered = signal(false);
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
      read: () => this.hasRendered.set(true),
    });
  }
}

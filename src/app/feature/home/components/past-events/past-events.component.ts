import { RouterLink } from '@angular/router';
import { NgOptimizedImage } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { Event } from '../../../../core/models/event.interface';
import { EventDateFormatPipe } from '../../../../core/pipes/date-format/event-date-format.pipe';
import { ViewportRevealDirective } from '../../../../ui/viewport-reveal/viewport-reveal.directive';

const PAST_EVENT_BACKGROUNDS: readonly string[] = [
  '/past-talks/Abstract background with logos_1.svg',
  '/past-talks/Abstract background with logos_2.svg',
  '/past-talks/Abstract background with logos_3.svg',
];

interface PastEventCard {
  id: string;
  slug: string;
  title: string;
  abstractBackground: string;
  meetupUrl: string;
  startsAt: string;
  venueLabel: string;
  talks: {
    id: string;
    title: string;
    speakerName: string;
    speakerImage: string | null;
    initials: string;
  }[];
}

@Component({
  selector: 'app-past-events',
  imports: [EventDateFormatPipe, NgOptimizedImage, RouterLink, ViewportRevealDirective],
  templateUrl: './past-events.component.html',
  styleUrl: './past-events.component.css',
})
export class PastEventsComponent {
  readonly events = input.required<Event[]>();
  readonly loading = input(false);
  readonly revealAfterHero = input(false);

  protected readonly cards = computed<PastEventCard[]>(() =>
    this.events().map((event, index) => {
      const talks = event.talks.slice(0, 3).map((talk) => {
        const speaker = talk.speaker_links.find((link) => link.speaker)?.speaker ?? null;
        const firstName = speaker?.first_name?.trim() ?? '';
        const lastName = speaker?.last_name?.trim() ?? '';
        const speakerName = `${firstName} ${lastName}`.trim() || 'Angular Zürich speaker';
        const initials =
          `${firstName.charAt(0)}${lastName.charAt(0)}`.trim() ||
          speakerName.charAt(0).toUpperCase();

        return {
          id: talk.id,
          title: talk.title,
          speakerName,
          speakerImage: speaker?.picture_url ?? null,
          initials,
        };
      });

      return {
        id: event.id,
        slug: event.slug,
        title: event.title.replace(/^Angular Zurich\s+/i, ''),
        abstractBackground: PAST_EVENT_BACKGROUNDS[index % PAST_EVENT_BACKGROUNDS.length],
        meetupUrl: event.meetup_url,
        startsAt: event.starts_at,
        venueLabel: event.venue?.title || event.venue?.city || 'Venue to be announced',
        talks,
      };
    }),
  );
}

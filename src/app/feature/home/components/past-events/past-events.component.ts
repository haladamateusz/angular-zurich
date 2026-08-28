import { RouterLink } from '@angular/router';
import { Component, computed, input } from '@angular/core';
import { Event } from '../../../../core/models/event.interface';
import { EventDateFormatPipe } from '../../../../core/pipes/date-format/event-date-format.pipe';
import { ViewportRevealDirective } from '../../../../ui/viewport-reveal/viewport-reveal.directive';

interface PastEventCard {
  id: string;
  slug: string;
  title: string;
  featureGraphic: string | null;
  meetupUrl: string;
  startsAt: string;
  venueLabel: string;
  speakers: {
    id: string;
    name: string;
    image: string;
  }[];
}

@Component({
  selector: 'app-past-events',
  imports: [EventDateFormatPipe, RouterLink, ViewportRevealDirective],
  templateUrl: './past-events.component.html',
  styleUrl: './past-events.component.css',
})
export class PastEventsComponent {
  readonly events = input.required<Event[]>();
  readonly loading = input(false);
  readonly revealAfterHero = input(false);

  protected readonly cards = computed<PastEventCard[]>(() =>
    this.events().map((event) => {
      const speakers = event.talks
        .flatMap((talk) => talk.speaker_links)
        .map((link) => link.speaker)
        .filter((speaker): speaker is NonNullable<typeof speaker> => Boolean(speaker))
        .filter((speaker, index, allSpeakers) => {
          return allSpeakers.findIndex((candidate) => candidate.id === speaker.id) === index;
        })
        .filter((speaker) => Boolean(speaker.picture_url))
        .map((speaker) => ({
          id: speaker.id,
          name: [speaker.first_name, speaker.last_name].filter(Boolean).join(' ') || 'Speaker',
          image: speaker.picture_url!,
        }));

      return {
        id: event.id,
        slug: event.slug,
        title: event.title.replace(/^Angular Zurich\s+/i, ''),
        featureGraphic: event.feature_graphic,
        meetupUrl: event.meetup_url,
        startsAt: event.starts_at,
        venueLabel: event.venue?.title || event.venue?.city || 'Venue to be announced',
        speakers,
      };
    }),
  );
}

import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  PLATFORM_ID,
  afterRenderEffect,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { Event } from '../../core/models/event.interface';
import { EventDateFormatPipe } from '../../core/pipes/date-format/event-date-format.pipe';
import { splitTextIntoParagraphs } from '../../core/utils/split-text-into-paragraphs';

const SLIDES_VISIBILITY_DELAY_MS = 2 * 60 * 60 * 1000;

const EMPTY_EVENT: Event = {
  id: '',
  slug: '',
  title: '',
  feature_graphic: null,
  meetup_url: '',
  starts_at: '',
  venue_id: '',
  talks: [],
  venue: {
    title: '',
    street: '',
    city: '',
    zip: '',
    google_maps_url: '',
  },
};

@Component({
  selector: 'app-event-details',
  imports: [EventDateFormatPipe, RouterLink],
  templateUrl: './event-details.component.html',
  styleUrl: './event-details.component.css',
})
export class EventDetailsComponent {
  slug = input.required<string>();
  protected readonly loadingCards = [1, 2, 3];
  private readonly currentTimestamp = signal(Date.now());
  private readonly loadedFeatureGraphicUrl = signal<string | null>(null);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);
  protected readonly showDashboardEventsBackLink = signal(
    this.router.currentNavigation()?.extras.state?.['fromDashboardEvents'] === true,
  );

  protected readonly eventResource = resource<Event, string>({
    params: () => this.slug(),
    defaultValue: EMPTY_EVENT,
    loader: async ({ params }) => {
      const { data, error } = await this.supabaseService.getEventBySlug(params);

      if (error) {
        throw error;
      }

      return data ?? EMPTY_EVENT;
    },
  });

  protected readonly event = computed(() => this.eventResource.value());
  protected readonly featureGraphicLoaded = computed(() => {
    const featureGraphicUrl = this.event().feature_graphic;

    return Boolean(featureGraphicUrl) && this.loadedFeatureGraphicUrl() === featureGraphicUrl;
  });
  protected readonly pageTitle = computed(() =>
    this.event().title.replace(/^Angular Zurich\s+/i, '') || 'Event details',
  );

  private readonly scrollToTopOnSlugChange = afterRenderEffect(() => {
    this.slug();
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    const currentTimestampInterval = window.setInterval(() => {
      this.currentTimestamp.set(Date.now());
    }, 60_000);

    this.destroyRef.onDestroy(() => {
      window.clearInterval(currentTimestampInterval);
    });
  }

  protected formatSpeakerName(firstName: string | null, lastName: string | null): string {
    return [firstName, lastName].filter((value): value is string => Boolean(value)).join(' ');
  }

  protected canShowSlides(eventStartsAt: string): boolean {
    const eventStartTimestamp = Date.parse(eventStartsAt);

    if (Number.isNaN(eventStartTimestamp)) {
      return false;
    }

    return this.currentTimestamp() >= eventStartTimestamp + SLIDES_VISIBILITY_DELAY_MS;
  }

  protected markFeatureGraphicAsLoaded(featureGraphicUrl: string | null): void {
    this.loadedFeatureGraphicUrl.set(featureGraphicUrl);
  }

  protected splitTalkDescription(description: string): string[] {
    return splitTextIntoParagraphs(description);
  }
}

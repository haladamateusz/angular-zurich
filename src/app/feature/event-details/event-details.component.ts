import { DatePipe, isPlatformBrowser } from '@angular/common';
import {
  Component,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { Event } from '../../core/models/event.interface';
import { splitTextIntoParagraphs } from '../../core/utils/split-text-into-paragraphs';

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
  imports: [DatePipe],
  templateUrl: './event-details.component.html',
  styleUrl: './event-details.component.css',
})
export class EventDetailsComponent {
  slug = input.required<string>();
  protected readonly loadingCards = [1, 2, 3];
  protected readonly featureGraphicLoaded = signal(false);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly supabaseService = inject(SupabaseService);

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
  protected readonly pageTitle = computed(() =>
    this.event().title.replace(/^Angular Zurich\s+/i, '') || 'Event details',
  );

  private readonly resetFeatureGraphicPlaceholder = effect(() => {
    if (this.event().feature_graphic !== undefined) {
      this.featureGraphicLoaded.set(false);
    }
  });

  private readonly scrollToTopOnSlugChange = effect(() => {
    this.slug();

    if (!this.isBrowser) {
      return;
    }

    afterNextRender(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  });

  protected formatSpeakerName(firstName: string | null, lastName: string | null): string {
    return [firstName, lastName].filter((value): value is string => Boolean(value)).join(' ');
  }

  protected markFeatureGraphicAsLoaded(): void {
    this.featureGraphicLoaded.set(true);
  }

  protected splitTalkDescription(description: string): string[] {
    return splitTextIntoParagraphs(description);
  }
}

import { Component, computed, inject, resource } from '@angular/core';
import { HeroComponent } from './components/hero/hero.component';
import { PastEventsComponent } from './components/past-events/past-events.component';
import { PartnersComponent } from './components/partners/partners.component';
import { StatsComponent } from './components/stats/stats.component';
import { TeamComponent } from './components/team/team.component';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { Event } from '../../core/models/event.interface';
import { Sponsor } from '../../core/models/sponsor.interface';
import { HOME_STATE_KEYS } from './data-access/home-state.keys';
import { HomeTransferStateService } from './data-access/home-transfer-state.service';

const EMPTY_EVENT: Event = {
  title: '',
  slug: '',
  feature_graphic: null,
  meetup_url: '',
  id: '',
  talks: [],
  venue: {
    title: '',
    city: '',
    zip: '',
    street: '',
    google_maps_url: '',
  },
  starts_at: '',
  venue_id: '',
};

const EMPTY_EVENTS: Event[] = [];
const EMPTY_SPONSORS: Sponsor[] = [];

@Component({
  selector: 'app-home',
  imports: [HeroComponent, PastEventsComponent, StatsComponent, TeamComponent, PartnersComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent {
  private readonly supabaseService = inject(SupabaseService);
  private readonly homeTransferState = inject(HomeTransferStateService);

  protected readonly upcomingPublicEvent = resource<Event, void>({
    defaultValue: EMPTY_EVENT,
    loader: () =>
      this.homeTransferState.load(HOME_STATE_KEYS.upcomingPublicEvent, async () => {
        const { data, error } = await this.supabaseService.getUpcomingPublicEvent();

        if (error) {
          throw error;
        }

        return data ?? EMPTY_EVENT;
      }),
  });

  protected readonly sponsors = resource<Sponsor[], void>({
    defaultValue: EMPTY_SPONSORS,
    loader: () =>
      this.homeTransferState.load(HOME_STATE_KEYS.sponsors, async () => {
        const { data, error } = await this.supabaseService.getSponsors();

        if (error) {
          throw error;
        }

        return data ?? EMPTY_SPONSORS;
      }),
  });

  protected readonly pastEvents = resource<Event[], void>({
    defaultValue: EMPTY_EVENTS,
    loader: () =>
      this.homeTransferState.load(HOME_STATE_KEYS.pastEvents, async () => {
        const { data, error } = await this.supabaseService.getPastEvents();

        if (error) {
          throw error;
        }

        return data ?? EMPTY_EVENTS;
      }),
  });

  protected readonly upcomingEvent = computed(() => {
    const event = this.upcomingPublicEvent.value();
    const startsAt = Date.parse(event.starts_at);

    if (!Number.isFinite(startsAt) || startsAt <= Date.now()) {
      return null;
    }

    return event;
  });
}

import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { HeroComponent } from './components/hero/hero.component';
import { PartnersComponent } from './components/partners/partners.component';
import { StatsComponent } from './components/stats/stats.component';
import { TeamComponent } from './components/team/team.component';
import { UpcomingTalksComponent } from './components/upcoming-talks/upcoming-talks.component';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { Event } from '../../core/models/event.interface';
import { Sponsor } from '../../core/models/sponsor.interface';

const EMPTY_EVENT: Event = {
  title: '',
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

const EMPTY_SPONSORS: Sponsor[] = [];

@Component({
  selector: 'app-home',
  imports: [HeroComponent, UpcomingTalksComponent, StatsComponent, TeamComponent, PartnersComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeComponent {
  private readonly supabaseService = inject(SupabaseService);

  protected readonly latestEvent = resource<Event, void>({
    defaultValue: EMPTY_EVENT,
    loader: async () => {
      const { data, error } = await this.supabaseService.getLatestEvent();

      if (error) {
        throw error;
      }

      return data ?? EMPTY_EVENT;
    },
  });

  protected readonly sponsors = resource<Sponsor[], void>({
    defaultValue: EMPTY_SPONSORS,
    loader: async () => {
      const { data, error } = await this.supabaseService.getSponsors();

      if (error) {
        throw error;
      }

      return data ?? EMPTY_SPONSORS;
    },
  });

  protected readonly upcomingEvent = computed(() => {
    const event = this.latestEvent.value();
    const startsAt = Date.parse(event.starts_at);

    if (!Number.isFinite(startsAt) || startsAt <= Date.now()) {
      return null;
    }

    return event;
  });
}

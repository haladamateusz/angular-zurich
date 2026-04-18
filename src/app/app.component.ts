import { Component, computed, inject, resource } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Event } from './core/interfaces/event.interface';
import { SupabaseService } from './core/services/supabase/supabase.service';
import { NavbarComponent } from './core/components/navbar/navbar.component';
import { HeroComponent } from './core/components/hero/hero.component';
import { UpcomingTalksComponent } from './core/components/upcoming-talks/upcoming-talks.component';
import { TeamComponent } from './core/components/team/team.component';
import { PartnersComponent } from './core/components/partners/partners.component';
import { StatsComponent } from './core/components/stats/stats.component';
import { Person } from './core/interfaces/person.interface';
import { Sponsor } from './core/interfaces/sponsor.interface';

const DEFAULT_EVENT: Event = {
  title: '',
  meetup_url: '',
  id: '',
  talks: [],
  venue: {
    title: '',
    city: '',
    zip: '',
    street: '',
    google_maps_url: ''
  },
  starts_at: '',
  venue_id: ''
};

const DEFAULT_SPONSORS: Sponsor[] = [];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavbarComponent, HeroComponent, StatsComponent, UpcomingTalksComponent, TeamComponent, PartnersComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class App {
  private readonly supabaseService = inject(SupabaseService);

  protected readonly latestEvent =
    resource<Event, void>({
      defaultValue: DEFAULT_EVENT,
      loader: async () => {
        const { data, error } = await this.supabaseService.getLatestEvent();

        if (error) throw error;
        return data ?? DEFAULT_EVENT;
      },
    });

  protected readonly sponsors = resource<Sponsor[], void>({
    defaultValue: DEFAULT_SPONSORS,
    loader: async () => {
      const { data, error } = await this.supabaseService.getSponsors();

      if (error) {
        throw error;
      }

      return data ?? DEFAULT_SPONSORS;
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

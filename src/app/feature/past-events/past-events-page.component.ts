import { Component, inject, resource } from '@angular/core';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { Event } from '../../core/models/event.interface';
import { PastEventsComponent } from '../home/components/past-events/past-events.component';

const EMPTY_EVENTS: Event[] = [];

@Component({
  selector: 'app-past-events-page',
  imports: [PastEventsComponent],
  templateUrl: './past-events-page.component.html',
  styleUrl: './past-events-page.component.css',
})
export class PastEventsPageComponent {
  private readonly supabaseService = inject(SupabaseService);

  protected readonly pastEvents = resource<Event[], void>({
    defaultValue: EMPTY_EVENTS,
    loader: async () => {
      const { data, error } = await this.supabaseService.getPastEvents();

      if (error) {
        throw error;
      }

      return data ?? EMPTY_EVENTS;
    },
  });

  protected retryPastEvents(): void {
    this.pastEvents.reload();
  }
}

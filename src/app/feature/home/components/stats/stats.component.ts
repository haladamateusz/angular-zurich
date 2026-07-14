import { Component, afterNextRender, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../../core/data-access/supabase/supabase.service';

interface Stat {
  value: string;
  label: string;
}

@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css'
})
export class StatsComponent {
  private readonly supabaseService = inject(SupabaseService);

  protected readonly stats = signal<Stat[]>([
    { value: '0', label: 'Talks' },
    { value: '0', label: 'Speakers' },
    { value: '0', label: 'Events' },
  ]);

  constructor() {
    afterNextRender(() => {
      void (async () => {
        const counts = await this.supabaseService.getStatsCounts();

        this.stats.set([
          { value: counts.talks.toString(), label: 'Talks' },
          { value: counts.speakers.toString(), label: 'Speakers' },
          { value: counts.events.toString(), label: 'Events' },
        ]);
      })();
    });
  }
}

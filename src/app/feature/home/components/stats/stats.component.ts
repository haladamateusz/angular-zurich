import { Component, computed, inject, resource } from '@angular/core';
import {
  StatsCounts,
  SupabaseService,
} from '../../../../core/data-access/supabase/supabase.service';
import { HOME_STATE_KEYS } from '../../data-access/home-state.keys';
import { HomeTransferStateService } from '../../data-access/home-transfer-state.service';

interface Stat {
  value: string;
  label: string;
}

const EMPTY_STATS: StatsCounts = {
  talks: 0,
  speakers: 0,
  events: 0,
};

@Component({
  selector: 'app-stats',
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css',
})
export class StatsComponent {
  private readonly supabaseService = inject(SupabaseService);
  private readonly homeTransferState = inject(HomeTransferStateService);

  private readonly statsCounts = resource<StatsCounts, void>({
    defaultValue: EMPTY_STATS,
    loader: () =>
      this.homeTransferState.load(HOME_STATE_KEYS.stats, () =>
        this.supabaseService.getStatsCounts(),
      ),
  });

  protected readonly stats = computed<Stat[]>(() => {
    const counts = this.statsCounts.value();

    return [
      { value: counts.talks.toString(), label: 'Talks' },
      { value: counts.speakers.toString(), label: 'Speakers' },
      { value: counts.events.toString(), label: 'Events' },
    ];
  });
}

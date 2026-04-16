import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { SupabaseService } from '../../services/supabase/supabase.service';

interface Stat {
  value: string;
  label: string;
}

@Component({
  selector: 'app-stats',
  imports: [],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsComponent implements OnInit {
  private readonly supabaseService = inject(SupabaseService);

  protected readonly stats = signal<Stat[]>([
    { value: '0', label: 'Talks' },
    { value: '0', label: 'Speakers' },
    { value: '0', label: 'Events' },
  ]);

  async ngOnInit(): Promise<void> {
    const counts = await this.supabaseService.getStatsCounts();

    this.stats.set([
      { value: counts.talks.toString(), label: 'Talks' },
      { value: counts.speakers.toString(), label: 'Speakers' },
      { value: counts.events.toString(), label: 'Events' },
    ]);
  }
}

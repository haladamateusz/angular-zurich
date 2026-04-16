import { Component, inject, resource } from '@angular/core';
import { Sponsor } from '../../interfaces/sponsor.interface';
import { SupabaseService } from '../../services/supabase/supabase.service';

@Component({
  selector: 'app-partners',
  imports: [],
  templateUrl: './partners.component.html',
  styleUrl: './partners.component.css',
})
export class PartnersComponent {
  private readonly supabaseService = inject(SupabaseService);

  protected readonly partners = resource<Sponsor[], void>({
    defaultValue: [],
    loader: async () => {
      const { data, error } = await this.supabaseService.getSponsors();

      if (error) {
        throw error;
      }

      return data ?? [];
    },
  });
}

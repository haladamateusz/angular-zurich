import { Component, inject, resource } from '@angular/core';
import { SupabaseService } from '../../../../core/data-access/supabase/supabase.service';
import { Person } from '../../../../core/models/person.interface';

@Component({
  selector: 'app-team',
  templateUrl: './team.component.html',
  styleUrl: './team.component.css'
})
export class TeamComponent {
  private readonly supabaseService = inject(SupabaseService);

  protected readonly organizersResource = resource<Person[], void>({
    defaultValue: [],
    loader: async () => {
      const { data, error } = await this.supabaseService.getOrganizers();

      if (error) throw error;
      return data ?? [];
    },
  });

  protected readonly formerOrganizersResource = resource<Person[], void>({
    defaultValue: [],
    loader: async () => {
      const { data, error } = await this.supabaseService.getFormerOrganizers();

      if (error) throw error;
      return data ?? [];
    },
  });
}

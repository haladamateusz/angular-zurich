import { Component, inject, resource } from '@angular/core';
import { SupabaseService } from '../../services/supabase/supabase.service';
import { JsonPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { from } from 'rxjs';
import { Person } from '../../interfaces/person.interface';


@Component({
  selector: 'app-team',
  templateUrl: './team.component.html',
  styleUrl: './team.component.css',
})
export class TeamComponent {
  supabaseService = inject(SupabaseService);

  organizersResource = resource<Person[], void>({
    defaultValue: [],
    loader: async () => {
      const { data, error } = await this.supabaseService.getOrganizers();

      if (error) throw error;
      return data ?? [];
    },
  })

  formerOrganizersResource = resource<Person[], void>({
    defaultValue: [],
    loader: async () => {
      const { data, error } = await this.supabaseService.getFormerOrganizers();

      if (error) throw error;
      return data ?? [];
    },
  });
}

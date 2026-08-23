import { Component, inject, resource } from '@angular/core';
import { SupabaseService } from '../../../../core/data-access/supabase/supabase.service';
import { Person } from '../../../../core/models/person.interface';
import { HOME_STATE_KEYS } from '../../data-access/home-state.keys';
import { HomeTransferStateService } from '../../data-access/home-transfer-state.service';

@Component({
  selector: 'app-team',
  templateUrl: './team.component.html',
  styleUrl: './team.component.css',
})
export class TeamComponent {
  private readonly supabaseService = inject(SupabaseService);
  private readonly homeTransferState = inject(HomeTransferStateService);

  protected readonly organizersResource = resource<Person[], void>({
    defaultValue: [],
    loader: () =>
      this.homeTransferState.load(HOME_STATE_KEYS.organizers, async () => {
        const { data, error } = await this.supabaseService.getOrganizers();

        if (error) throw error;
        return data ?? [];
      }),
  });

  protected readonly formerOrganizersResource = resource<Person[], void>({
    defaultValue: [],
    loader: () =>
      this.homeTransferState.load(HOME_STATE_KEYS.formerOrganizers, async () => {
        const { data, error } = await this.supabaseService.getFormerOrganizers();

        if (error) throw error;
        return data ?? [];
      }),
  });

  protected retryOrganizers(): void {
    this.organizersResource.reload();
  }

  protected retryFormerOrganizers(): void {
    this.formerOrganizersResource.reload();
  }
}

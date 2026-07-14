import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-dashboard-section-nav',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './dashboard-section-nav.component.html',
  styleUrl: './dashboard-section-nav.component.css',
})
export class DashboardSectionNavComponent {}

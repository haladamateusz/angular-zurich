import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Sponsor } from '../../../../core/models/sponsor.interface';

@Component({
  selector: 'app-partners',
  imports: [],
  templateUrl: './partners.component.html',
  styleUrl: './partners.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PartnersComponent {
  readonly partners = input.required<Sponsor[]>();
}

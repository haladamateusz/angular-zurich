import { Component, input } from '@angular/core';
import { Sponsor } from '../../../../core/models/sponsor.interface';
import { PartnerTrackingUrlPipe } from './partner-tracking-url.pipe';

@Component({
  selector: 'app-partners',
  imports: [PartnerTrackingUrlPipe],
  templateUrl: './partners.component.html',
  styleUrl: './partners.component.css'
})
export class PartnersComponent {
  readonly partners = input.required<Sponsor[]>();
}

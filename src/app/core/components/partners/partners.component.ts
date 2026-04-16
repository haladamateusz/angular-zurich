import { Component, input } from '@angular/core';
import { Sponsor } from '../../interfaces/sponsor.interface';

@Component({
  selector: 'app-partners',
  imports: [],
  templateUrl: './partners.component.html',
  styleUrl: './partners.component.css',
})
export class PartnersComponent {
  readonly partners = input.required<Sponsor[]>();
}

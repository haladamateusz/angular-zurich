import { Component, input } from '@angular/core';
import { Sponsor } from '../../../../core/models/sponsor.interface';

@Component({
  selector: 'app-partners',
  imports: [],
  templateUrl: './partners.component.html',
  styleUrl: './partners.component.css'
})
export class PartnersComponent {
  readonly partners = input.required<Sponsor[]>();

  protected partnerUrl(partner: Sponsor): string {
    const url = new URL(partner.website_url);

    url.searchParams.set('utm_source', 'angular-zurich');
    url.searchParams.set('utm_medium', 'referral');
    url.searchParams.set('utm_campaign', 'partners');

    return url.toString();
  }
}

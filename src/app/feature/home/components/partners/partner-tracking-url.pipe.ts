import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'partnerTrackingUrl',
})
export class PartnerTrackingUrlPipe implements PipeTransform {
  transform(value: string): string {
    const url = new URL(value);

    url.searchParams.set('utm_source', 'angular-zurich');
    url.searchParams.set('utm_medium', 'referral');
    url.searchParams.set('utm_campaign', 'partners');

    return url.toString();
  }
}

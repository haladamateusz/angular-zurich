import { Component } from '@angular/core';

interface Partner {
  name: string;
  url: string;
  logo: string;
}

@Component({
  selector: 'app-partners',
  imports: [],
  templateUrl: './partners.component.html',
  styleUrl: './partners.component.css',
})
export class PartnersComponent {
  protected readonly partners: Partner[] = [
    {
      name: 'Syncrea',
      url: 'https://syncrea.ch',
      logo: 'partners/syncrea.svg',
    },
    {
      name: 'Angular Day',
      url: 'https://angularday.it',
      logo: 'partners/angular-day.svg',
    },
    {
      name: 'Coalist',
      url: 'https://coalist.ch',
      logo: 'partners/coalist.svg',
    },
    {
      name: 'Angular Experts',
      url: 'https://angularexperts.io',
      logo: 'partners/angular-experts.svg',
    },
  ];
}

import { Component } from '@angular/core';

interface Sponsor {
  name: string;
  logo: string;
}

@Component({
  selector: 'app-hero',
  imports: [],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.css',
})
export class HeroComponent {
  protected readonly sponsors: Sponsor[] = [
    { name: 'Syncrea', logo: 'partners/syncrea.svg' },
    { name: 'Angular Day', logo: 'partners/angular-day.svg' },
    { name: 'Coalist', logo: 'partners/coalist.svg' },
    { name: 'Angular Experts', logo: 'partners/angular-experts.svg' },
  ];
}

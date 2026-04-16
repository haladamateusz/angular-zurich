import { Component, input } from '@angular/core';
import { Sponsor } from '../../interfaces/sponsor.interface';

@Component({
  selector: 'app-hero',
  imports: [],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.css',
})
export class HeroComponent {
  readonly sponsors = input.required<Sponsor[]>();
}

import { Component } from '@angular/core';

interface Stat {
  value: string;
  label: string;
}

@Component({
  selector: 'app-stats',
  imports: [],
  templateUrl: './stats.component.html',
  styleUrl: './stats.component.css',
})
export class StatsComponent {
  protected readonly stats: Stat[] = [
    { value: '248', label: 'Talks' },
    { value: '193', label: 'Speakers' },
    { value: '81', label: 'Events' },
  ];
}

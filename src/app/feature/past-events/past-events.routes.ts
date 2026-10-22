import { Routes } from '@angular/router';

export const PAST_EVENTS_ROUTES: Routes = [
  {
    path: '',
    title: 'Past events | Angular Zürich',
    loadComponent: () =>
      import('./past-events-page.component').then((m) => m.PastEventsPageComponent),
  },
];

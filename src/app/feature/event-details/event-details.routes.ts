import { Routes } from '@angular/router';

export const EVENT_DETAILS_ROUTES: Routes = [
  {
    path: '',
    title: 'Event details | Angular Zürich',
    loadComponent: () => import('./event-details.component').then((m) => m.EventDetailsComponent),
  },
];

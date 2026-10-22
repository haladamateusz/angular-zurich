import { Routes } from '@angular/router';

export const EVENT_DETAILS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./event-details.component').then((m) => m.EventDetailsComponent),
  },
];

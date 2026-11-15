import { Routes } from '@angular/router';

export const HOME_ROUTES: Routes = [
  {
    path: '',
    title: 'Angular Zürich',
    loadComponent: () => import('./home.component').then((m) => m.HomeComponent),
  },
];

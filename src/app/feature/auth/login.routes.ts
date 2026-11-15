import { Routes } from '@angular/router';

export const LOGIN_ROUTES: Routes = [
  {
    path: '',
    title: 'Organizer sign in | Angular Zürich',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
  },
];

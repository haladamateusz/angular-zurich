import { Routes } from '@angular/router';

export const AUTH_CALLBACK_ROUTES: Routes = [
  {
    path: '',
    title: 'Signing in | Angular Zürich',
    loadComponent: () =>
      import('./callback/auth-callback.component').then((m) => m.AuthCallbackComponent),
  },
];

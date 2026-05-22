import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./feature/home/home.routes').then((m) => m.HOME_ROUTES),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./feature/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./feature/auth/callback/auth-callback.component').then(
        (m) => m.AuthCallbackComponent,
      ),
  },
  {
    path: 'talk-submission',
    loadChildren: () =>
      import('./feature/submit-talk/submit-talk.routes').then((m) => m.SUBMIT_TALK_ROUTES),
  },
  {
    path: 'theme-showcase',
    loadChildren: () =>
      import('./feature/theme-showcase/theme-showcase.routes').then((m) => m.THEME_SHOWCASE_ROUTES),
  },
];

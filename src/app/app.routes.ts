import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./feature/home/home.routes').then((m) => m.HOME_ROUTES),
  },
  {
    path: 'talk-submission',
    loadChildren: () => import('./feature/submit-talk/submit-talk.routes').then((m) => m.SUBMIT_TALK_ROUTES),
  },
  {
    path: 'theme-showcase',
    loadChildren: () =>
      import('./feature/theme-showcase/theme-showcase.routes').then(
        (m) => m.THEME_SHOWCASE_ROUTES,
      ),
  },
];

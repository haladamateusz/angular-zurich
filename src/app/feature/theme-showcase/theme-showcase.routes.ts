import { Routes } from '@angular/router';

export const THEME_SHOWCASE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./theme-showcase.component').then((m) => m.ThemeShowcaseComponent),
  },
];

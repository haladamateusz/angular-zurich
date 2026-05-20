import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/main-layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      {
        path: '',
        loadChildren: () => import('./feature/home/home.routes').then((m) => m.HOME_ROUTES),
      },
      {
        path: 'theme-showcase',
        loadChildren: () =>
          import('./feature/theme-showcase/theme-showcase.routes').then(
            (m) => m.THEME_SHOWCASE_ROUTES,
          ),
      },
    ],
  },
];

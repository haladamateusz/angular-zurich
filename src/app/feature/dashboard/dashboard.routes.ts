import { Routes } from '@angular/router';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'submissions/:submissionId',
    loadComponent: () =>
      import('./dashboard-submission-detail.component').then(
        (m) => m.DashboardSubmissionDetailComponent,
      ),
  },
];

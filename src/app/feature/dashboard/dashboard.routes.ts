import { Routes } from '@angular/router';
import { eventAdminGuard } from '../../core/auth/event-admin.guard';
import { DashboardShellComponent } from './dashboard-shell.component';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    component: DashboardShellComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'talk-submissions',
      },
      {
        path: 'talk-submissions',
        loadComponent: () => import('./dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'events/create',
        canActivate: [eventAdminGuard],
        loadComponent: () => import('./create-event.component').then((m) => m.CreateEventComponent),
      },
      {
        path: 'events/:eventId',
        canActivate: [eventAdminGuard],
        loadComponent: () => import('./create-event.component').then((m) => m.CreateEventComponent),
      },
      {
        path: 'events',
        loadComponent: () =>
          import('./dashboard-events.component').then((m) => m.DashboardEventsComponent),
      },
      {
        path: 'talk-submissions/:submissionId',
        loadComponent: () =>
          import('./dashboard-submission-detail.component').then(
            (m) => m.DashboardSubmissionDetailComponent,
          ),
      },
      {
        path: 'submissions/:submissionId',
        redirectTo: 'talk-submissions/:submissionId',
      },
    ],
  },
];

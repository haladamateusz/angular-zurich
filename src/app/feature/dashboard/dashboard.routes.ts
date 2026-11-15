import { Routes } from '@angular/router';
import { eventAdminGuard } from '../../core/auth/event-admin.guard';
import { DashboardShellComponent } from './dashboard-shell.component';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    title: 'Dashboard | Angular Zürich',
    component: DashboardShellComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'talk-submissions',
      },
      {
        path: 'talk-submissions',
        title: 'Talk submissions | Angular Zürich',
        loadComponent: () => import('./dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'events/create',
        title: 'Create event | Angular Zürich',
        canActivate: [eventAdminGuard],
        loadComponent: () => import('./create-event.component').then((m) => m.CreateEventComponent),
      },
      {
        path: 'events/:eventId',
        title: 'Edit event | Angular Zürich',
        canActivate: [eventAdminGuard],
        loadComponent: () => import('./create-event.component').then((m) => m.CreateEventComponent),
      },
      {
        path: 'events',
        title: 'Manage events | Angular Zürich',
        loadComponent: () =>
          import('./dashboard-events.component').then((m) => m.DashboardEventsComponent),
      },
      {
        path: 'talk-submissions/:submissionId',
        title: 'Review talk submission | Angular Zürich',
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

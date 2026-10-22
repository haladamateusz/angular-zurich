import { Routes } from '@angular/router';
import { organizerAuthGuard } from './core/auth/organizer-auth.guard';

export const routes: Routes = [
  {
    path: 'chat',
    canActivate: [organizerAuthGuard],
    loadChildren: () => import('./feature/chat/chat.routes').then((m) => m.CHAT_ROUTES),
  },
  {
    path: '',
    loadChildren: () => import('./feature/home/home.routes').then((m) => m.HOME_ROUTES),
  },
  {
    path: 'login',
    loadChildren: () => import('./feature/auth/login.routes').then((m) => m.LOGIN_ROUTES),
  },
  {
    path: 'auth/callback',
    loadChildren: () =>
      import('./feature/auth/auth-callback.routes').then((m) => m.AUTH_CALLBACK_ROUTES),
  },
  {
    path: 'talk-submission',
    loadChildren: () =>
      import('./feature/submit-talk/submit-talk.routes').then((m) => m.SUBMIT_TALK_ROUTES),
  },
  {
    path: 'dashboard',
    canActivate: [organizerAuthGuard],
    loadChildren: () =>
      import('./feature/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
  },
  {
    path: 'theme-showcase',
    loadChildren: () =>
      import('./feature/theme-showcase/theme-showcase.routes').then((m) => m.THEME_SHOWCASE_ROUTES),
  },
  {
    path: 'events',
    loadChildren: () =>
      import('./feature/past-events/past-events.routes').then((m) => m.PAST_EVENTS_ROUTES),
  },
  {
    path: 'events/:slug',
    loadChildren: () =>
      import('./feature/event-details/event-details.routes').then((m) => m.EVENT_DETAILS_ROUTES),
  },
];

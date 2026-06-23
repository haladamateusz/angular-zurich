import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: 'talk-submission/:submissionId',
    renderMode: RenderMode.Server,
  },
  {
    path: 'events/:slug',
    renderMode: RenderMode.Server,
  },
  {
    path: 'auth/callback',
    renderMode: RenderMode.Client,
  },
  {
    path: 'dashboard/**',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];

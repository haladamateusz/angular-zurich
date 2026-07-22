import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    path: '',
    renderMode: RenderMode.Server,
  },
  {
    path: 'talk-submission/:submissionId/edit',
    renderMode: RenderMode.Client,
  },
  {
    path: 'talk-submission/:submissionId',
    renderMode: RenderMode.Client,
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

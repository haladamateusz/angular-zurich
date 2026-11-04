import { Routes } from '@angular/router';

export const CHAT_ROUTES: Routes = [
  {
    // One route definition keeps the active page/agent mounted on the first save.
    matcher: (segments) =>
      segments.length > 1
        ? null
        : { consumed: segments, posParams: segments[0] ? { threadId: segments[0] } : undefined },
    title: 'Chräungie | Angular Zürich',
    loadComponent: () => import('./chat-page/chat-page.component').then((m) => m.ChatPageComponent),
  },
];

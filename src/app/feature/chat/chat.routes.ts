import { Routes } from '@angular/router';

export const CHAT_ROUTES: Routes = [
  {
    path: '',
    title: 'Ask the archive | Angular Zürich',
    loadComponent: () => import('./chat-page/chat-page.component').then((m) => m.ChatPageComponent),
  },
];

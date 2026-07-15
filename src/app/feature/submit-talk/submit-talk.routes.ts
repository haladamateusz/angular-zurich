import { Routes } from '@angular/router';

export const SUBMIT_TALK_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./submit-talk.component').then((m) => m.SubmitTalkComponent),
  },
  {
    path: ':submissionId/edit',
    loadComponent: () =>
      import('./submit-talk.component').then((m) => m.SubmitTalkComponent),
  },
  {
    path: ':submissionId',
    loadChildren: () =>
      import('../submit-talk-success/submit-talk-success.routes').then(
        (m) => m.SUBMIT_TALK_SUCCESS_ROUTES,
      ),
  },
];

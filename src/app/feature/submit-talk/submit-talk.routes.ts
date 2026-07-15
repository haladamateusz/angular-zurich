import { Routes } from '@angular/router';
import { talkSubmissionExistsGuard } from './talk-submission-exists.guard';

export const SUBMIT_TALK_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./submit-talk.component').then((m) => m.SubmitTalkComponent),
  },
  {
    path: ':submissionId/edit',
    canActivate: [talkSubmissionExistsGuard],
    loadComponent: () =>
      import('./submit-talk.component').then((m) => m.SubmitTalkComponent),
  },
  {
    path: ':submissionId',
    canActivate: [talkSubmissionExistsGuard],
    loadChildren: () =>
      import('../submit-talk-success/submit-talk-success.routes').then(
        (m) => m.SUBMIT_TALK_SUCCESS_ROUTES,
      ),
  },
];

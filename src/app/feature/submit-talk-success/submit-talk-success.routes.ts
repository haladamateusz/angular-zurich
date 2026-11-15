import { Routes } from '@angular/router';

export const SUBMIT_TALK_SUCCESS_ROUTES: Routes = [
  {
    path: '',
    title: 'Talk submission status | Angular Zürich',
    loadComponent: () =>
      import('./submit-talk-success.component').then((m) => m.SubmitTalkSuccessComponent),
  },
];

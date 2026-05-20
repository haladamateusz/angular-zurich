import { Routes } from '@angular/router';

export const SUBMIT_TALK_SUCCESS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./submit-talk-success.component').then((m) => m.SubmitTalkSuccessComponent),
  },
];

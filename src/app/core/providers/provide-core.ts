import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideClientHydration,
  withEventReplay,
  withNoIncrementalHydration,
} from '@angular/platform-browser';
import { provideRouter, Routes, withComponentInputBinding } from '@angular/router';
import { AuthService } from '../auth/auth.service';

export interface CoreOptions {
  routes: Routes;
}

export function provideCore({ routes }: CoreOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideBrowserGlobalErrorListeners(),
    provideClientHydration(withEventReplay(), withNoIncrementalHydration()),
    provideRouter(routes, withComponentInputBinding()),
    provideAppInitializer(() => inject(AuthService).initialize()),
  ]);
}

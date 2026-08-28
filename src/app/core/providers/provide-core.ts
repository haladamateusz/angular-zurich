import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideAppInitializer,
} from '@angular/core';
import { provideRouter, Routes, withComponentInputBinding } from '@angular/router';
import { AuthService } from '../auth/auth.service';

export interface CoreOptions {
  routes: Routes;
}

export function provideCore({ routes }: CoreOptions): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => inject(AuthService).initialize()),
    provideRouter(routes, withComponentInputBinding()),
  ]);
}

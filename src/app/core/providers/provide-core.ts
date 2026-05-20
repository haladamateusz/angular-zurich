import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { provideRouter, Routes, withComponentInputBinding } from '@angular/router';

export interface CoreOptions {
  routes: Routes;
}

export function provideCore({ routes }: CoreOptions): EnvironmentProviders {
  return makeEnvironmentProviders([provideRouter(routes, withComponentInputBinding())]);
}

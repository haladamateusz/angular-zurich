import { ApplicationConfig } from '@angular/core';
import { routes } from './app.routes';
import { provideCore } from './core/providers/provide-core';

export const appConfig: ApplicationConfig = {
  providers: [provideCore({ routes })],
};

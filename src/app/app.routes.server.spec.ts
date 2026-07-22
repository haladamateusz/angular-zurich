import { RenderMode } from '@angular/ssr';
import { describe, expect, it } from 'vitest';
import { serverRoutes } from './app.routes.server';

describe('server routes', () => {
  it('server-renders the home page with current event data', () => {
    expect(serverRoutes).toContainEqual({
      path: '',
      renderMode: RenderMode.Server,
    });
  });
});

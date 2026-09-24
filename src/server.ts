import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { isDevMode } from '@angular/core';

// Also support direct `ng serve`/IDE launches. This file is server-only;
// production reads its host's environment and never loads a local secrets file.
if (isDevMode() && process.env['NODE_ENV'] !== 'production') {
  const localEnv = join(process.cwd(), '.env.local');
  if (existsSync(localEnv)) loadEnvFile(localEnv);
}

const browserDistFolder = join(import.meta.dirname, '../browser');

export const app = express();
const angularApp = new AngularNodeAppEngine();

app.use('/api/chat', async (req, res, next) => {
  try {
    const { chatRouter } = await import('./server/chat/router');
    chatRouter(req, res, next);
  } catch (error) {
    next(error);
  }
});

/**
 * Example Express Rest API endpoints can be defined here.
 * Uncomment and define endpoints as necessary.
 *
 * Example:
 * ```ts
 * app.get('/api/{*splat}', (req, res) => {
 *   // Handle API request
 * });
 * ```
 */

/**
 * Serve static files from /browser
 */
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

/**
 * Handle all other requests by rendering the Angular application.
 */
app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) => (response ? writeResponseToNodeResponse(response, res) : next()))
    .catch(next);
});

/**
 * Start the server if this module is the main entry point, or it is ran via PM2.
 * The server listens on the port defined by the `PORT` environment variable, or defaults to 4000.
 */
if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) {
      throw error;
    }

    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

/**
 * Request handler used by the Angular CLI (for dev-server and during build) or Firebase Cloud Functions.
 */
export const reqHandler = createNodeRequestHandler(app);

export default reqHandler;

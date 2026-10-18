import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { draftFixture } from './draft-fixture';

test('edit, review, stale approval recovery and explicit event publication', async ({ page }) => {
  let draft = structuredClone(draftFixture);
  let publishes = 0;
  let stale = true;
  const environment = await readFile('src/environments/environment.development.ts', 'utf8');
  const url = environment.match(/supabaseUrl:\s*['"]([^'"]+)['"]/)![1];
  const project = new URL(url).hostname.split('.')[0];
  await page.addInitScript(
    ({ project, id }) => {
      const user = {
        id,
        email: 'draft-browser@gmail.com',
        aud: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01',
      };
      const token = `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: id, email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 }))}.fixture`;
      localStorage.setItem(
        `sb-${project}-auth-token`,
        JSON.stringify({
          access_token: token,
          refresh_token: 'fixture',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          user,
        }),
      );
    },
    { project, id: draft.created_by },
  );
  await page.route(`${url}/**`, (route) => route.fulfill({ json: [] }));
  await page.route('**/api/chat/access', (route) =>
    route.fulfill({ json: { approved: true, available: true } }),
  );
  await page.route('**/api/chat/draft-options', (route) =>
    route.fulfill({
      json: {
        venues: [
          {
            id: draft.content.venueId,
            title: 'Constructor Nexademy',
            street: 'Förrlibuckstrasse 150',
            city: 'Zürich',
          },
        ],
        speakers: [
          { id: draft.content.talks[0].speakerIds[0], first_name: 'Mateusz', last_name: 'Halada' },
        ],
        talks: [],
      },
    }),
  );
  await page.route('**/api/chat/drafts/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'GET')
      return route.fulfill({
        json: {
          draft,
          audit: [
            {
              id: crypto.randomUUID(),
              actor_id: draft.created_by,
              action: 'create',
              version: 1,
              created_at: draft.created_at,
            },
          ],
        },
      });
    const body = route.request().postDataJSON();
    if (path.endsWith('/update')) {
      draft = {
        ...draft,
        version: draft.version + 1,
        content: { ...draft.content, ...body.fields },
      };
      return route.fulfill({ json: draft });
    }
    if (path.endsWith('/review'))
      return route.fulfill({ json: { draft, token: `approval-${draft.version}` } });
    if (path.endsWith('/publish')) {
      expect(body.confirmed).toBe(true);
      expect(body.token).toBe(`approval-${body.expectedVersion}`);
      if (stale) {
        stale = false;
        draft = { ...draft, version: draft.version + 1 };
        return route.fulfill({
          status: 409,
          json: { error: 'The draft changed. Reload and review it again.' },
        });
      }
      publishes++;
      draft = {
        ...draft,
        state: 'published',
        version: draft.version + 1,
        event_slug: 'agentic-angular',
        event_id: crypto.randomUUID(),
      };
      return route.fulfill({ json: draft });
    }
    throw new Error(`Unexpected draft action ${path}`);
  });
  await page.goto(`/chat?draft=${draft.id}`);
  const editor = page.getByRole('region', { name: 'Event drafts', exact: true });
  await expect(
    editor.getByRole('heading', { name: 'Agentic Angular meetup', exact: true }),
  ).toBeVisible();
  await editor
    .getByLabel('Description', { exact: true })
    .first()
    .fill('A description edited by a human.');
  await expect(editor.getByRole('button', { name: 'Review for publication' })).toBeDisabled();
  await editor.getByRole('button', { name: 'Save event details' }).click();
  await expect(editor.getByRole('status')).toContainText('saved privately');
  await editor.getByRole('button', { name: 'Review for publication' }).click();
  await expect(editor.getByRole('heading', { name: 'Publish this event?' })).toBeFocused();
  await expect(editor).toContainText('A description edited by a human.');
  expect(publishes).toBe(0);
  await page.addScriptTag({ content: axe.source });
  const violations = () =>
    page.evaluate(
      async () =>
        (
          await (
            window as unknown as {
              axe: { run: (selector: string) => Promise<{ violations: unknown[] }> };
            }
          ).axe.run('app-event-draft-preview')
        ).violations,
    );
  expect(await violations()).toEqual([]);
  await page.screenshot({ path: 'tmp/event-draft-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  expect(await violations()).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'tmp/event-draft-mobile.png', fullPage: true });
  await editor.getByRole('button', { name: 'Publish event publicly' }).click();
  await expect(editor.getByRole('alert')).toContainText('changed');
  expect(publishes).toBe(0);
  await editor.getByRole('button', { name: 'Reload latest version' }).click();
  await editor.getByRole('button', { name: 'Review for publication' }).click();
  await editor.getByRole('button', { name: 'Publish event publicly' }).click();
  await expect(editor.getByRole('link', { name: 'View published event' })).toHaveAttribute(
    'href',
    '/events/agentic-angular',
  );
  expect(publishes).toBe(1);
});

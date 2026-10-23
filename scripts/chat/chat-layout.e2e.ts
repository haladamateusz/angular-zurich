import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { draftFixture } from './draft-fixture';
import axe from 'axe-core';

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 500 },
]) {
  test(`chat fills the viewport and preserves its editor on refocus at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const environment = await readFile('src/environments/environment.development.ts', 'utf8');
    const url = environment.match(/supabaseUrl:\s*['"]([^'"]+)['"]/)![1];
    const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
    await page.addInitScript(
      ({ storageKey, userId }) => {
        const user = {
          id: userId,
          email: 'layout@example.com',
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: { full_name: 'Layout user' },
          created_at: '2026-01-01',
        };
        const expires = Math.floor(Date.now() / 1000) + 3600;
        const token = `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: user.id, exp: expires }))}.fixture`;
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            access_token: token,
            refresh_token: 'fixture',
            token_type: 'bearer',
            expires_at: expires,
            expires_in: 3600,
            user,
          }),
        );
      },
      { storageKey, userId: draftFixture.created_by },
    );
    await page.route(`${url}/**`, (route) => route.fulfill({ json: [] }));
    let accessChecks = 0;
    let releaseAccess!: () => void;
    const accessGate = new Promise<void>((resolve) => {
      releaseAccess = resolve;
    });
    await page.route('**/api/chat/access', async (route) => {
      accessChecks++;
      await accessGate;
      await route.fulfill({ json: { approved: true, available: true } });
    });
    let draftLoads = 0;
    await page.route('**/api/chat/drafts/**', (route) => {
      draftLoads++;
      return route.fulfill({ json: { draft: draftFixture, audit: [] } });
    });
    await page.route('**/api/chat/draft-options', (route) =>
      route.fulfill({
        json: {
          venues: [
            {
              id: draftFixture.content.venueId,
              title: 'Zürich venue',
              street: 'Main street 1',
              city: 'Zürich',
            },
          ],
          speakers: [
            {
              id: draftFixture.content.talks[0].speakerIds[0],
              first_name: 'Test',
              last_name: 'Speaker',
            },
          ],
          talks: [],
        },
      }),
    );
    await page.route('**/api/chat/run', (route) => {
      const body = route.request().postDataJSON();
      const messageId = crypto.randomUUID();
      const events = [
        { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
        {
          type: 'CUSTOM',
          name: 'archive_sources',
          value: {
            messageId,
            sources: [],
            result: {
              kind: 'event_draft',
              draftId: draftFixture.id,
              version: draftFixture.version,
            },
          },
        },
        { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: 'Your event draft is saved privately.' },
        { type: 'TEXT_MESSAGE_END', messageId },
        { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
      ];
      return route.fulfill({
        contentType: 'text/event-stream',
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      });
    });

    await page.goto('/chat');
    const surface = page.locator('.archive-chat-surface');
    const composer = page.locator('.archive-chat-composer');
    await expect(page.getByRole('status', { name: 'Loading chat' })).toBeVisible();
    const loadingBottom = await surface.evaluate(
      (element) => element.getBoundingClientRect().bottom,
    );
    expect(loadingBottom).toBeGreaterThan(viewport.height - 30);
    expect(loadingBottom).toBeLessThanOrEqual(viewport.height);
    releaseAccess();
    const input = page.getByRole('textbox', { name: 'Your question', exact: true });
    await expect(input).toBeVisible();
    const initialComposer = (await composer.boundingBox())!;
    expect(await surface.evaluate((element) => element.getBoundingClientRect().bottom)).toBeCloseTo(
      loadingBottom,
      0,
    );

    await input.fill('Prepare an event draft');
    await input.press('Enter');
    const title = page.locator('app-event-draft-preview input[formcontrolname="title"]');
    await expect(title).toHaveValue(draftFixture.content.title);
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
    expect((await composer.boundingBox())!.y).toBeCloseTo(initialComposer.y, 0);
    await input.fill('Keep this next question');

    const transcript = page.getByRole('log');
    await transcript.evaluate((element) => {
      element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
      element.dispatchEvent(new Event('scroll'));
      element.dataset['preserved'] = 'true';
    });
    const scroll = await transcript.evaluate((element) => element.scrollTop);
    expect(scroll).toBeGreaterThan(0);
    const checksBefore = accessChecks;

    // Exercise the SDK's real visibility recovery path, then its session event channel.
    await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')));
    await page.evaluate((storageKey) => {
      const session = JSON.parse(localStorage.getItem(storageKey)!);
      session.user.user_metadata.full_name = 'Refocused user';
      const channel = new BroadcastChannel(storageKey);
      channel.postMessage({ event: 'SIGNED_IN', session });
      channel.close();
    }, storageKey);
    await expect(page.locator('nav')).toContainText('Refocused user');
    await expect(transcript).toHaveAttribute('data-preserved', 'true');
    expect(await transcript.evaluate((element) => element.scrollTop)).toBeCloseTo(scroll, 0);
    expect(accessChecks).toBe(checksBefore);
    expect(draftLoads).toBe(1);
    await expect(input).toHaveValue('Keep this next question');
    expect((await composer.boundingBox())!.y).toBeCloseTo(initialComposer.y, 0);

    await page.setViewportSize({ ...viewport, height: viewport.height + 120 });
    await expect
      .poll(() => surface.evaluate((element) => element.getBoundingClientRect().bottom))
      .toBeCloseTo(loadingBottom + 120, 0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeInViewport();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({ path: test.info().outputPath('chat-layout.png') });
    await page.addScriptTag({ content: axe.source });
    const violations = await page.evaluate(async () => {
      const browser = window as unknown as { axe: typeof axe };
      return (await browser.axe.run('app-chat-page')).violations;
    });
    expect(violations).toEqual([]);
  });
}

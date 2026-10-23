import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import axe from 'axe-core';
const id = '9b0b6d9e-527f-44a0-a128-a3565783ca2a';

test('approved archive chat: zero-cost open, source cards, keyboard, mobile, dark mode and errors', async ({
  page,
}) => {
  const errors: string[] = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  let runs = 0;
  const feedbackRatings: (string | null)[] = [];
  let feedbackFails = false;
  let mode: 'answer' | 'quota' | 'revoked' | 'html-error' | 'html-success' | 'submissions' =
    'answer';
  page.on('pageerror', (error) => errors.push(error.message));
  const environment = await readFile('src/environments/environment.development.ts', 'utf8');
  const supabaseUrl = environment.match(/supabaseUrl:\s*['"]([^'"]+)['"]/)?.[1];
  expect(
    supabaseUrl,
    'Development Supabase URL must be configured for the auth fixture',
  ).toBeTruthy();
  const project = new URL(supabaseUrl!).hostname.split('.')[0];
  await page.addInitScript(
    ({ project, id }) => {
      // Exercise a contended background refresh through the real browser lock
      // callback while keeping normal session reads/writes unchanged.
      const request = navigator.locks.request.bind(navigator.locks);
      Object.defineProperty(navigator.locks, 'request', {
        value: (name: string, options: LockOptions, callback: LockGrantedCallback) =>
          request(name, options, (lock) => {
            if (options.ifAvailable) {
              document.documentElement.dataset['authLockContentionTested'] = 'true';
              return callback(null);
            }
            return callback(lock);
          }),
      });
      const user = {
        id,
        email: 'chat-browser-test@gmail.com',
        aud: 'authenticated',
        app_metadata: {},
        user_metadata: { full_name: 'Archive Tester' },
        created_at: '2026-01-01',
      };
      const token = `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: id, email: user.email, exp: Math.floor(Date.now() / 1000) + 3600 }))}.fixture`;
      localStorage.setItem(
        `sb-${project}-auth-token`,
        JSON.stringify({
          access_token: token,
          token_type: 'bearer',
          refresh_token: 'fixture',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          expires_in: 3600,
          user,
        }),
      );
    },
    { project, id },
  );
  await page.route(`${supabaseUrl}/**`, (route) => route.fulfill({ status: 200, json: [] }));
  await page.route('**/api/chat/access', (route) =>
    route.fulfill({ json: { approved: true, available: true } }),
  );
  await page.route('**/api/chat/feedback', (route) => {
    const body = route.request().postDataJSON();
    expect(route.request().headers()['authorization']).toMatch(/^Bearer /);
    expect(body.messageId).toBe(id);
    expect(body.question).toBe('Who gave a talk about signals?');
    expect(body.sourceIds).toEqual([id]);
    expect(body.answer).toContain('Test Speaker discussed Angular signals');
    if (feedbackFails) return route.fulfill({ status: 503, json: {} });
    feedbackRatings.push(body.rating);
    return route.fulfill({ json: { rating: body.rating } });
  });
  await page.route('**/api/chat/run', async (route) => {
    runs++;
    if (mode === 'html-error' || mode === 'html-success') {
      return route.fulfill({
        status: mode === 'html-error' ? 502 : 200,
        contentType: 'text/html',
        body: '<html><body>Temporary upstream failure</body></html>',
      });
    }
    if (mode === 'quota') {
      await route.fulfill({ status: 429, json: { error: 'Today’s chat allowance is used up.' } });
      return;
    }
    if (mode === 'revoked') {
      await route.fulfill({ status: 403, json: { error: 'Access revoked.' } });
      return;
    }
    const body = route.request().postDataJSON();
    if (mode === 'submissions') {
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
              kind: 'submissions',
              hasMore: false,
              items: [
                {
                  id,
                  title: 'A submitted talk',
                  speaker: 'Test Speaker',
                  status: 'initially_submitted',
                },
              ],
            },
          },
        },
        { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
        {
          type: 'TEXT_MESSAGE_CONTENT',
          messageId,
          delta: 'Showing 1 matching submission awaiting organizer review.',
        },
        { type: 'TEXT_MESSAGE_END', messageId },
        { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
      ];
      return route.fulfill({
        contentType: 'text/event-stream',
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      });
    }
    expect(body.messages.every((message: { role: string }) => message.role === 'user')).toBe(true);
    expect(route.request().headers()['authorization']).toMatch(/^Bearer /);
    const events = [
      { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
      {
        type: 'ACTIVITY_SNAPSHOT',
        messageId: crypto.randomUUID(),
        activityType: 'archive_search',
        content: {
          id,
          tool: 'search_talks',
          label: 'Search talk titles and descriptions',
          state: 'running',
          detail: 'signals',
        },
      },
      {
        type: 'ACTIVITY_SNAPSHOT',
        messageId: crypto.randomUUID(),
        activityType: 'archive_search',
        content: {
          id,
          tool: 'search_talks',
          label: 'Search talk titles and descriptions',
          state: 'complete',
          detail: 'signals · 1 matching record',
          durationMs: 120,
        },
      },
      {
        type: 'CUSTOM',
        name: 'archive_sources',
        value: {
          messageId: id,
          result: {
            kind: 'stats',
            total: 1,
            past: 1,
            upcoming: 0,
            years: [{ year: 2019, past: 1, upcoming: 0 }],
          },
          sources: [
            {
              id,
              title: 'Signals in practice',
              speakers: ['Test Speaker'],
              eventTitle: 'Angular Zürich 2019',
              date: '2019-01-01',
              description: 'An introduction to Angular signals.',
              url: '/events/2019-meetup',
            },
          ],
        },
      },
      { type: 'TEXT_MESSAGE_START', messageId: id, role: 'assistant' },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: id,
        delta: 'Test Speaker discussed Angular signals at the 2019 meetup.',
      },
      { type: 'TEXT_MESSAGE_END', messageId: id },
      { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
    ];
    await route.fulfill({
      contentType: 'text/event-stream',
      body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    });
  });
  await page.goto('/chat');
  const pronunciation = page.locator('.archive-pronunciation');
  const audio = page.locator('audio');
  await expect(pronunciation).toHaveAccessibleName('Hear how to pronounce Chräungie');
  await expect(audio).toHaveAttribute('preload', 'none');
  await pronunciation.focus();
  await pronunciation.press('Enter');
  await expect(pronunciation).toHaveClass(/is-playing/);
  await expect(pronunciation).toHaveAccessibleName('Stop pronunciation');
  await expect(page.locator('.archive-pronunciation-wave').first()).toHaveCSS(
    'animation-name',
    'none',
  );
  await expect(pronunciation).not.toHaveClass(/is-playing/);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.duration)).toBeCloseTo(1.2, 1);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await pronunciation.click();
  await expect(pronunciation).toHaveClass(/is-playing/);
  await expect(page.locator('.archive-pronunciation-wave').first()).toHaveCSS(
    'animation-name',
    /pronunciation-wave$/,
  );
  await pronunciation.click();
  await expect(pronunciation).not.toHaveClass(/is-playing/);
  expect(await audio.evaluate((element: HTMLAudioElement) => element.paused)).toBe(true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByLabel('Your question', { exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-auth-lock-contention-tested', 'true');
  expect(runs).toBe(0);
  await page.getByLabel('Your question', { exact: true }).fill('Who gave a talk about signals?');
  await expect(page.getByLabel('Your question', { exact: true })).toBeFocused();
  expect(runs).toBe(0);
  const question = page.getByLabel('Your question', { exact: true });
  await question.press('Shift+Enter');
  expect(runs).toBe(0);
  await expect(question).toHaveValue('Who gave a talk about signals?\n');
  await question.press('Enter');
  const activity = page.getByRole('log').locator('.archive-activity');
  await expect(activity).not.toHaveAttribute('open');
  await expect(activity.locator(':scope > summary')).toContainText('complete');
  await expect(page.locator('.archive-chat-composer .archive-activity')).toHaveCount(0);
  await activity.locator(':scope > summary').click();
  await expect(activity).toHaveAttribute('open');
  await page.locator('.archive-activity-step summary').click();
  await expect(activity).toContainText('1 matching record');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toHaveAccessibleName(
    'Send',
  );
  await expect(page.getByRole('heading', { name: 'Signals in practice' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'To event page for Signals in practice' }),
  ).toHaveAttribute('href', '/events/2019-meetup');
  await expect(page.getByRole('log')).toContainText('Test Speaker');
  await expect(page.locator('.archive-answer')).toContainText(
    'Test Speaker discussed Angular signals',
  );
  expect(
    await page
      .locator('.archive-source')
      .evaluate((card) =>
        Boolean(
          card.compareDocumentPosition(document.querySelector('.archive-answer')!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
  ).toBe(true);
  const useful = page.getByRole('button', { name: 'Useful', exact: true });
  const notQuite = page.getByRole('button', { name: 'Not quite', exact: true });
  await useful.focus();
  await useful.press('Enter');
  await expect(useful).toHaveAttribute('aria-pressed', 'true');
  await notQuite.click();
  await expect(notQuite).toHaveAttribute('aria-pressed', 'true');
  feedbackFails = true;
  await useful.click();
  await expect(page.getByRole('alert')).toContainText('couldn’t save your feedback');
  await expect(notQuite).toHaveAttribute('aria-pressed', 'true');
  feedbackFails = false;
  await useful.click();
  await expect(useful).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(runs).toBe(1);
  await useful.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/chat-desktop.png', fullPage: true });
  await page.addScriptTag({ content: axe.source });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: {
          run: (context: string) => Promise<{ violations: { id: string; description: string }[] }>;
        };
      }
    ).axe;
    return (await axe.run('app-chat-page')).violations;
  });
  expect(violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  await expect(page.locator('.archive-source-link')).toHaveCSS('color', 'rgb(66, 165, 245)');
  await useful.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'tmp/chat-mobile-dark.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const darkViolations = await page.evaluate(
    async () =>
      (
        await (
          window as unknown as {
            axe: { run: (context: string) => Promise<{ violations: unknown[] }> };
          }
        ).axe.run('app-chat-page')
      ).violations,
  );
  expect(darkViolations).toEqual([]);
  await page.getByRole('button', { name: 'Remove feedback' }).click();
  await expect(useful).toHaveAttribute('aria-pressed', 'false');
  await expect(notQuite).toHaveAttribute('aria-pressed', 'false');
  expect(feedbackRatings).toEqual(['useful', 'not_quite', 'useful', null]);
  for (const htmlMode of ['html-error', 'html-success'] as const) {
    mode = htmlMode;
    await question.fill('Do we have any talk submissions awaiting review?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByRole('alert')).toContainText('try again');
    await expect(page.getByRole('alert')).not.toContainText('JSON');
    await expect(page.getByRole('alert')).not.toContainText('<html>');
    await expect(page.getByRole('button', { name: 'Edit and retry question' })).toBeEnabled();
  }
  mode = 'submissions';
  await question.fill('Do we have any talk submissions awaiting review?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(
    page.getByRole('link', { name: /Open submission\s*: A submitted talk/ }),
  ).toHaveAttribute('href', `/dashboard/talk-submissions/${id}`);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.screenshot({ path: 'tmp/chat-submissions-mobile.png', fullPage: true });
  expect(
    await page.evaluate(
      async () =>
        (
          await (
            window as unknown as {
              axe: { run: (context: string) => Promise<{ violations: unknown[] }> };
            }
          ).axe.run('app-chat-page')
        ).violations,
    ),
  ).toEqual([]);
  mode = 'quota';
  await page.getByLabel('Your question', { exact: true }).fill('What about testing?');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('alert')).toContainText('allowance');
  mode = 'revoked';
  await page.getByLabel('Your question', { exact: true }).fill('Another question');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('heading', { name: 'Approved accounts only' })).toBeVisible();
  await expect(page.getByRole('log')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('anonymous visitors cannot open the chat', async ({ page }) => {
  await page.goto('/chat');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel('Your question', { exact: true })).toHaveCount(0);
});

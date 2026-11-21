import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import axe from 'axe-core';
import type { ChatThread, SavedMessage } from '../../src/app/core/models/chat-history.model';

const userId = '11111111-1111-4111-8111-111111111111';
const otherThread = '22222222-2222-4222-8222-222222222222';

for (const width of [1920, 1440, 390]) {
  const mobile = width < 1600;
  test(`saved conversations: refresh, resume, rename, delete and accessible ${mobile ? 'drawer' : 'sidebar'} at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 640 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    const expectCenteredDialog = async (name: string) => {
      const dialog = page.getByRole('dialog', { name, exact: true });
      await expect(dialog).toBeVisible();
      const box = (await dialog.boundingBox())!;
      const viewport = await page.evaluate(() => ({
        width: document.documentElement.getBoundingClientRect().width,
        height: window.innerHeight,
      }));
      expect(box.x + box.width / 2).toBeCloseTo(viewport.width / 2, 0);
      expect(box.y + box.height / 2).toBeCloseTo(viewport.height / 2, 0);
    };
    const environment = await readFile('src/environments/environment.development.ts', 'utf8');
    const url = environment.match(/supabaseUrl:\s*['"]([^'"]+)['"]/)![1];
    const project = new URL(url).hostname.split('.')[0];
    await page.addInitScript(
      ({ project, userId }) => {
        const user = {
          id: userId,
          email: 'history@gmail.com',
          aud: 'authenticated',
          app_metadata: {},
          user_metadata: { given_name: 'Mateusz' },
          created_at: '2026-01-01',
        };
        const expires = Math.floor(Date.now() / 1000) + 3600;
        const token = `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: userId, exp: expires }))}.fixture`;
        localStorage.setItem(
          `sb-${project}-auth-token`,
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
      { project, userId },
    );
    await page.route(`${url}/**`, (route) => route.fulfill({ json: [] }));
    const threads = new Map<string, { thread: ChatThread; messages: SavedMessage[] }>();
    threads.set(otherThread, {
      thread: {
        id: otherThread,
        title: 'Planning the November meetup',
        revision: 1,
        requires_organizer: false,
        last_message_at: '2026-10-25T12:00:00Z',
      },
      messages: [],
    });
    let runs = 0;
    let releaseAccess!: () => void;
    const accessReady = new Promise<void>((resolve) => {
      releaseAccess = resolve;
    });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/chat/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/chat', '');
      const method = route.request().method();
      if (path === '/access') {
        await accessReady;
        return route.fulfill({ json: { approved: true, available: true, historyEnabled: true } });
      }
      if (path === '/threads')
        return route.fulfill({
          json: {
            enabled: true,
            items: [...threads.values()]
              .map((item) => item.thread)
              .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at)),
            cursor: null,
          },
        });
      if (path === '/run') {
        runs++;
        const input = route.request().postDataJSON();
        const content = input.messages.at(-1).content as string;
        const current = threads.get(input.threadId) ?? {
          thread: {
            id: input.threadId,
            title: content,
            revision: 0,
            last_message_at: new Date().toISOString(),
            requires_organizer: false,
          },
          messages: [],
        };
        expect(input.revision).toBe(current.thread.revision);
        const answerId = crypto.randomUUID();
        const answer = `Saved answer ${runs}: Angular signals and testing talks.`;
        current.thread.revision++;
        const sequence = current.messages.length;
        current.messages.push(
          {
            id: input.questionId,
            sequence: sequence + 1,
            role: 'user',
            text: content,
            reply_to: null,
            run_id: input.runId,
            status: 'complete',
            payload: { version: 1, sources: [], activity: [] },
            created_at: new Date().toISOString(),
          },
          {
            id: answerId,
            sequence: sequence + 2,
            role: 'assistant',
            text: answer,
            reply_to: input.questionId,
            run_id: input.runId,
            status: 'complete',
            payload: { version: 1, sources: [], activity: [] },
            created_at: new Date().toISOString(),
          },
        );
        threads.set(input.threadId, current);
        const events = [
          { type: 'RUN_STARTED', threadId: input.threadId, runId: input.runId },
          {
            type: 'CUSTOM',
            name: 'history_saved',
            value: { threadId: input.threadId, revision: current.thread.revision },
          },
          { type: 'CUSTOM', name: 'archive_sources', value: { messageId: answerId, sources: [] } },
          { type: 'TEXT_MESSAGE_START', messageId: answerId, role: 'assistant' },
          { type: 'TEXT_MESSAGE_CONTENT', messageId: answerId, delta: answer },
          { type: 'TEXT_MESSAGE_END', messageId: answerId },
          { type: 'RUN_FINISHED', threadId: input.threadId, runId: input.runId },
        ];
        return route.fulfill({
          contentType: 'text/event-stream',
          body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
        });
      }
      const id = path.split('/')[2];
      const data = threads.get(id);
      if (!data)
        return route.fulfill({ status: 404, json: { error: 'This conversation is unavailable.' } });
      if (path.endsWith('/messages'))
        return route.fulfill({ json: { ...data, before: null, activeRun: null } });
      if (method === 'PATCH') {
        data.thread.title = route.request().postDataJSON().title;
        data.thread.revision++;
        return route.fulfill({ json: data.thread });
      }
      if (method === 'DELETE') {
        threads.delete(id);
        return route.fulfill({ status: 204 });
      }
      return route.fulfill({ status: 204 });
    });
    await page.goto('/events');
    await page.evaluate(() => document.fonts.ready);
    // Exercise a page scrollbar even when the event fixture has no results.
    await page.locator('main').evaluate((element) => {
      element.style.minHeight = '200vh';
    });
    const navbarBox = (await page.locator('app-navbar nav > div').boundingBox())!;
    await page.goto('/chat');
    const placeholder = page.locator('.archive-chat-loading-mascot');
    await expect(placeholder).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const placeholderBox = (await placeholder.boundingBox())!;
    const pageBox = (await page.locator('app-chat-page').boundingBox())!;
    expect(placeholderBox.x + placeholderBox.width / 2).toBeCloseTo(
      pageBox.x + pageBox.width / 2,
      0,
    );
    releaseAccess();
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
    expect(await page.locator('app-navbar nav > div').boundingBox()).toEqual(navbarBox);
    const welcome = page.locator('.archive-chat-empty .archive-chat-mascot');
    const welcomeBox = (await welcome.boundingBox())!;
    const footerBox = (await page.getByRole('contentinfo').boundingBox())!;
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(footerBox.y + footerBox.height).toBeLessThanOrEqual(viewportHeight);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      viewportHeight,
    );
    expect(welcomeBox.x).toBeCloseTo(placeholderBox.x, 0);
    expect(welcomeBox.y).toBeCloseTo(placeholderBox.y, 0);
    if (!mobile) {
      const sidebar = page.getByRole('complementary', { name: 'Chat history' });
      const sidebarBox = (await sidebar.boundingBox())!;
      const chatBox = (await page.locator('.archive-chat').boundingBox())!;
      expect(sidebarBox.x).toBeGreaterThan(0);
      expect(sidebarBox.x + sidebarBox.width).toBeLessThan(chatBox.x);
      const conversationBox = (await page.locator('.archive-chat-surface').boundingBox())!;
      expect(sidebarBox.y).toBeCloseTo(conversationBox.y, 0);
    } else {
      await page.getByRole('button', { name: 'History', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Your chats' })).toBeVisible();
      expect(await welcome.boundingBox()).toEqual(welcomeBox);
      await page.keyboard.press('Escape');
    }
    await page.screenshot({ path: `tmp/chat-history-welcome-${width}.png` });
    expect(runs).toBe(0);
    await page
      .getByRole('textbox', { name: 'Your question' })
      .fill('Find talks about Angular signals');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page).toHaveURL(/\/chat\/[0-9a-f-]{36}$/);
    const savedUrl = page.url();
    await expect(page.getByText('Saved answer 1:', { exact: false })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Saved answer 1:', { exact: false })).toBeVisible();
    expect(runs).toBe(1);
    await page.getByRole('textbox', { name: 'Your question' }).fill('Only those about testing');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Saved answer 2:', { exact: false })).toBeVisible();
    if (mobile) await page.getByRole('button', { name: 'History', exact: true }).click();
    const nav = mobile
      ? page.getByRole('dialog', { name: 'Your chats' })
      : page.getByRole('complementary', { name: 'Chat history' });
    await expect(nav.getByRole('link', { name: 'Find talks about Angular signals' })).toBeVisible();
    await nav.getByRole('button', { name: 'Actions for Find talks about Angular signals' }).click();
    await nav.getByRole('button', { name: 'Rename', exact: true }).click();
    await expectCenteredDialog('Rename conversation');
    await page.getByRole('textbox', { name: 'Conversation title' }).fill('Signals research');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(nav.getByRole('link', { name: 'Signals research' })).toBeVisible();
    await nav.getByRole('link', { name: 'Planning the November meetup' }).click();
    await expect(page).toHaveURL(new RegExp(otherThread));
    await expect(page.getByText('Saved answer 1:', { exact: false })).not.toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(savedUrl);
    await expect(page.getByText('Saved answer 2:', { exact: false })).toBeVisible();
    expect(runs).toBe(2);
    await page.addScriptTag({ content: axe.source });
    const audit = await page.evaluate(
      async () =>
        await (window as unknown as { axe: typeof axe }).axe.run(
          document.querySelector('app-chat-page')!,
        ),
    );
    expect(
      audit.violations.map((item) => ({
        id: item.id,
        nodes: item.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: `tmp/chat-history-${width}.png`,
      fullPage: true,
    });
    if (mobile) {
      await page.getByRole('button', { name: 'History', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Your chats' })).toBeVisible();
      const drawerAudit = await page.evaluate(
        async () =>
          await (window as unknown as { axe: typeof axe }).axe.run(
            document.querySelector('app-chat-page')!,
          ),
      );
      expect(drawerAudit.violations).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('button', { name: 'History', exact: true })).toBeFocused();
      await page.getByRole('button', { name: 'History', exact: true }).click();
    }
    await nav.getByRole('button', { name: 'Actions for Signals research' }).click();
    await nav.getByRole('button', { name: 'Delete', exact: true }).click();
    await expectCenteredDialog('Delete conversation?');
    await page.screenshot({ path: `tmp/chat-history-delete-${width}.png` });
    await page.getByRole('button', { name: 'Delete conversation', exact: true }).click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
    await page.goto(savedUrl);
    await expect(page.getByText('This conversation is unavailable.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await page.goto('/events');
    expect(await page.locator('app-navbar nav > div').boundingBox()).toEqual(navbarBox);
    expect(errors).toEqual([]);
  });
}

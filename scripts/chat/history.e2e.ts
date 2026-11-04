import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import axe from 'axe-core';
import type { ChatThread, SavedMessage } from '../../src/app/core/models/chat-history.model';

const userId = '11111111-1111-4111-8111-111111111111';
const otherThread = '22222222-2222-4222-8222-222222222222';

for (const mobile of [false, true]) {
  test(`saved conversations: refresh, resume, rename, delete and accessible ${mobile ? 'drawer' : 'sidebar'}`, async ({
    page,
  }) => {
    await page.setViewportSize(
      mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    );
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
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
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/chat/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/chat', '');
      const method = route.request().method();
      if (path === '/access')
        return route.fulfill({ json: { approved: true, available: true, historyEnabled: true } });
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
    await page.goto('/chat');
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
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
      path: `tmp/chat-history-${mobile ? 'mobile' : 'desktop'}.png`,
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
    await page.getByRole('button', { name: 'Delete conversation', exact: true }).click();
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
    await page.goto(savedUrl);
    await expect(page.getByText('This conversation is unavailable.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    expect(errors).toEqual([]);
  });
}

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import axe from 'axe-core';

for (const width of [1920, 390]) {
  test(`virtual history keeps New chat separate and renders a bounded list at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width < 640 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
    const environment = await readFile('src/environments/environment.development.ts', 'utf8');
    const url = environment.match(/supabaseUrl:\s*['"]([^'"]+)['"]/)![1];
    const project = new URL(url).hostname.split('.')[0];
    await page.addInitScript((project) => {
      const user = {
        id: '11111111-1111-4111-8111-111111111111',
        email: 'history@gmail.com',
        aud: 'authenticated',
        app_metadata: {},
        user_metadata: { given_name: 'Mateusz' },
        created_at: '2026-01-01',
      };
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const token = `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: user.id, exp: expires }))}.fixture`;
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
    }, project);
    await page.route(`${url}/**`, (route) => route.fulfill({ json: [] }));
    const items = Array.from({ length: 200 }, (_, i) => ({
      id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`,
      title: `Conversation ${String(i + 1).padStart(3, '0')}`,
      revision: 1,
      requires_organizer: false,
      last_message_at: new Date(Date.now() - i * 86400000).toISOString(),
    }));
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/chat/**', async (route) => {
      const path = new URL(route.request().url()).pathname.replace('/api/chat', '');
      if (path === '/access')
        return route.fulfill({ json: { approved: true, available: true, historyEnabled: true } });
      if (path === '/threads') {
        const start = Number(new URL(route.request().url()).searchParams.get('cursor') ?? 0);
        return route.fulfill({
          json: {
            enabled: true,
            items: items.slice(start, start + 30),
            cursor: start + 30 < items.length ? String(start + 30) : null,
          },
        });
      }
      if (path.endsWith('/messages'))
        return route.fulfill({
          json: { thread: items.at(-1), messages: [], before: null, activeRun: null },
        });
      return route.fulfill({ status: 204 });
    });
    await page.goto('/chat');
    await expect(page.getByRole('textbox', { name: 'Your question' })).toBeVisible();
    if (width < 1600) await page.getByRole('button', { name: 'History', exact: true }).click();
    const history =
      width < 1600
        ? page.getByRole('dialog', { name: 'Your chats' })
        : page.getByRole('complementary', { name: 'Chat history' });
    const viewport = history.getByRole('region', { name: 'Past conversations' });
    const newChat = history.getByRole('button', { name: 'New chat', exact: true });
    await expect(
      history.getByRole('link', { name: 'Conversation 001', exact: true }),
    ).toBeVisible();
    await expect(newChat).toBeVisible();
    for (let pageNumber = 1; pageNumber < 7; pageNumber++) {
      const more = history.getByRole('button', { name: 'Load more chats', exact: true });
      await more.click();
      await expect(history.getByRole('navigation')).toHaveAttribute('aria-busy', 'false');
    }
    const buttonBox = await newChat.boundingBox();
    expect(await viewport.locator('.history-row').count()).toBeLessThan(40);
    await viewport.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(
      history.getByRole('link', { name: 'Conversation 200', exact: true }),
    ).toBeVisible();
    expect(await viewport.locator('.history-row').count()).toBeLessThan(40);
    expect(await newChat.boundingBox()).toEqual(buttonBox);
    const lastRow = history.getByRole('link', { name: 'Conversation 200', exact: true });
    const lastRowBox = await lastRow.boundingBox();
    const trigger = history.getByRole('button', { name: 'Actions for Conversation 200' });
    await trigger.click();
    await expect(history.getByRole('button', { name: 'Rename', exact: true })).toBeVisible();
    expect(await lastRow.boundingBox()).toEqual(lastRowBox);
    const popup = history.locator('.history-actions:popover-open');
    const popupBox = (await popup.boundingBox())!;
    expect(popupBox.y).toBeGreaterThanOrEqual(0);
    expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(width < 640 ? 844 : 1000);
    await page.screenshot({ path: `tmp/chat-history-menu-${width}.png` });
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await history.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Conversation title' })).toHaveValue(
      'Conversation 200',
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.addScriptTag({ content: axe.source });
    const audit = await page.evaluate(async () =>
      (window as unknown as { axe: typeof axe }).axe.run(
        document.querySelector('.history-drawer[open]') ??
          document.querySelector('.history-desktop')!,
      ),
    );
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: `tmp/chat-history-virtual-${width}.png` });
    await newChat.click();
    await expect(page).toHaveURL(/\/chat$/);
    if (width < 1600) await expect(history).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}

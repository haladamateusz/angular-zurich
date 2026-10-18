import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`question flies from composer to bubble at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const environment = await readFile('src/environments/environment.development.ts', 'utf8');
    const supabaseUrl = environment.match(/supabaseUrl:\s*['"]([^'"]+)['"]/)![1];
    const project = new URL(supabaseUrl).hostname.split('.')[0];
    await page.addInitScript((project) => {
      const user = {
        id: '9b0b6d9e-527f-44a0-a128-a3565783ca2a',
        email: 'chat-animation@example.com',
        aud: 'authenticated',
        app_metadata: {},
        user_metadata: {},
        created_at: '2026-01-01',
      };
      const expires = Math.floor(Date.now() / 1000) + 3600;
      const token = `${btoa(JSON.stringify({ alg: 'HS256' }))}.${btoa(JSON.stringify({ sub: user.id, email: user.email, exp: expires }))}.fixture`;
      localStorage.setItem(
        `sb-${project}-auth-token`,
        JSON.stringify({
          access_token: token,
          token_type: 'bearer',
          refresh_token: 'fixture',
          expires_at: expires,
          expires_in: 3600,
          user,
        }),
      );
    }, project);
    await page.route(`${supabaseUrl}/**`, (route) => route.fulfill({ json: [] }));
    await page.route('**/api/chat/access', (route) =>
      route.fulfill({ json: { approved: true, available: true } }),
    );
    await page.route('**/api/chat/run', (route) => {
      const body = route.request().postDataJSON();
      const messageId = crypto.randomUUID();
      const events = [
        { type: 'RUN_STARTED', threadId: body.threadId, runId: body.runId },
        { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: 'Try searching for Angular signals.' },
        { type: 'TEXT_MESSAGE_END', messageId },
        { type: 'RUN_FINISHED', threadId: body.threadId, runId: body.runId },
      ];
      return route.fulfill({
        contentType: 'text/event-stream',
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      });
    });
    await page.goto('/chat');
    const input = page.getByLabel('Your question', { exact: true });
    const transcript = page.getByRole('log');
    const flight = page.locator('.archive-question-flight');
    for (let i = 0; i < 5; i++) {
      await input.fill(`Previous question ${i}`);
      await input.press('Enter');
      await expect(page.locator('.archive-answer')).toHaveCount(i + 1);
      await expect(page.getByRole('button', { name: 'Send question', exact: true })).toBeVisible();
      await expect(flight).toHaveCount(0);
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await input.fill('And signals?');
    await input.scrollIntoViewIfNeeded();
    await input.evaluate((element) => {
      element.closest('form')!.addEventListener('submit', () => {
        const rect = element.getBoundingClientRect();
        element.dataset['sendOrigin'] = JSON.stringify({
          x: rect.x + scrollX,
          y: rect.y + scrollY,
          width: rect.width,
          height: rect.height,
        });
      });
      element.addEventListener(
        'keydown',
        () => {
          const rect = element.getBoundingClientRect();
          element.dataset['sendOrigin'] = JSON.stringify({
            x: rect.x + scrollX,
            y: rect.y + scrollY,
            width: rect.width,
            height: rect.height,
          });
        },
        { capture: true },
      );
    });
    await transcript.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
      const observer = new MutationObserver(() => {
        const overlay = document.querySelector('.archive-question-flight');
        if (!overlay) return;
        const animation = overlay.getAnimations()[0];
        animation.pause();
        animation.currentTime = 0;
        observer.disconnect();
      });
      observer.observe(element.parentElement!, { childList: true });
    });
    if (viewport.width === 390)
      await page.getByRole('button', { name: 'Send question', exact: true }).click();
    else await input.press('Enter');
    await expect(flight).toHaveCount(1);
    await expect(flight).toHaveAttribute('aria-hidden', 'true');
    const origin = await input.evaluate((element) => {
      const rect = JSON.parse(element.dataset['sendOrigin']!);
      return { ...rect, x: rect.x - scrollX, y: rect.y - scrollY };
    });
    const initial = (await flight.boundingBox())!;
    expect(initial.x).toBeCloseTo(origin!.x, 0);
    expect(initial.y).toBeCloseTo(origin!.y, 0);
    expect(initial.width).toBeCloseTo(origin!.width, 0);
    expect(initial.height).toBeCloseTo(origin!.height, 0);
    await expect
      .poll(() =>
        transcript.evaluate((element) =>
          Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight),
        ),
      )
      .toBeLessThan(2);
    const bubble = transcript.locator('.archive-message-user').last();
    await expect(bubble).toHaveCSS('opacity', '0');
    const { landed, destination } = await flight.evaluate((element) => {
      const animation = element.getAnimations()[0];
      animation.currentTime = Number(animation.effect!.getTiming().duration);
      const bubbles = document.querySelectorAll('.archive-chat-transcript .archive-message-user');
      return {
        landed: element.getBoundingClientRect().toJSON(),
        destination: bubbles[bubbles.length - 1].getBoundingClientRect().toJSON(),
      };
    });
    expect(landed.x).toBeCloseTo(destination.x, 0);
    expect(landed.y).toBeCloseTo(destination.y, 0);
    expect(landed.width).toBeCloseTo(destination.width, 0);
    expect(landed.height).toBeCloseTo(destination.height, 0);
    expect(landed.width).toBeLessThan(initial.width);
    await expect(flight).toHaveCount(0);
    await expect(bubble).toHaveCSS('opacity', '1');
    await expect(input).toBeFocused();

    // Resetting during a flight must reveal/remove both visual layers cleanly.
    await input.fill('One more question');
    await input.press('Enter');
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    await expect(flight).toHaveCount(0);
    await expect(transcript.locator('.archive-message-user')).toHaveCount(0);
  });
}

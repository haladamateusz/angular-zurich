import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const scenarios = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
].flatMap((viewport) =>
  [0, 5].flatMap((previousCount) =>
    [
      { label: 'short', question: 'And signals?' },
      {
        label: 'multiline',
        question:
          'Find talks about Angular signals, forms, and application architecture.\nWhich speakers shared practical examples and where can I find their slides?',
      },
    ].map((content) => ({ viewport, previousCount, ...content })),
  ),
);

for (const { viewport, previousCount, label, question } of scenarios) {
  test(`${label} question slides without stretching at ${viewport.width}px after ${previousCount} messages`, async ({
    page,
  }) => {
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
    const sent = transcript.locator('.archive-question-sent');
    for (let i = 0; i < previousCount; i++) {
      await input.fill(`Previous question ${i}`);
      await input.press('Enter');
      await expect(page.locator('.archive-answer')).toHaveCount(i + 1);
      await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
      await expect(sent).toHaveCount(0);
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await input.fill(question);
    await input.scrollIntoViewIfNeeded();
    await transcript.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
      const observer = new MutationObserver(() => {
        const bubble = element.querySelector('.archive-question-sent');
        const animation = bubble?.getAnimations()[0];
        if (!animation) return;
        animation.pause();
        animation.currentTime = 0;
        document
          .querySelectorAll('.archive-mascot-enter, .archive-mascot-exit')
          .forEach((mascot) => {
            mascot.getAnimations().forEach((fade) => {
              fade.pause();
              fade.currentTime = 0;
            });
          });
        observer.disconnect();
      });
      observer.observe(element, { childList: true, attributes: true, subtree: true });
    });
    if (viewport.width === 390)
      await page.getByRole('button', { name: 'Send', exact: true }).click();
    else await input.press('Enter');
    await expect(sent).toHaveCount(1);
    if (previousCount === 0) {
      const fades = await page.evaluate(() => {
        const exit = document.querySelector('.archive-mascot-exit')!;
        const enter = document.querySelector('.archive-mascot-enter')!;
        const outgoing = exit.getAnimations()[0];
        const incoming = enter.getAnimations()[0];
        const exitDuration = Number(outgoing.effect!.getTiming().duration);
        const enterDelay = incoming.effect!.getTiming().delay;
        outgoing.currentTime = exitDuration;
        incoming.currentTime = enterDelay;
        const result = {
          exitDuration,
          enterDelay,
          outgoingOpacity: getComputedStyle(exit).opacity,
          incomingOpacity: getComputedStyle(enter).opacity,
          outgoingTransform: getComputedStyle(exit).transform,
          incomingTransform: getComputedStyle(enter).transform,
        };
        outgoing.finish();
        incoming.finish();
        return result;
      });
      expect(fades.enterDelay).toBeGreaterThanOrEqual(fades.exitDuration);
      expect(fades.outgoingOpacity).toBe('0');
      expect(fades.incomingOpacity).toBe('0');
      expect(fades.outgoingTransform).toBe('none');
      expect(fades.incomingTransform).toBe('none');
    }
    const bubble = transcript.locator('.archive-message-user').last();
    // Sample the real bubble and glyphs to catch scaling or text reflow.
    const { samples, finalBox, finalText, duration } = await bubble.evaluate((element) => {
      const animation = element.getAnimations()[0];
      const duration = Number(animation.effect!.getTiming().duration);
      const textBounds = () => {
        const range = document.createRange();
        range.selectNodeContents(element.querySelector('.archive-message-text')!);
        return range.getBoundingClientRect().toJSON();
      };
      const samples = [0, 0.25, 0.5, 0.75, 0.95].map((progress) => {
        animation.currentTime = duration * progress;
        return {
          box: element.getBoundingClientRect().toJSON(),
          text: textBounds(),
        };
      });
      animation.currentTime = duration;
      return {
        samples,
        finalBox: element.getBoundingClientRect().toJSON(),
        finalText: textBounds(),
        duration,
      };
    });
    expect(duration).toBeLessThanOrEqual(150);
    expect(samples[0].box.x).toBeCloseTo(finalBox.x, 0);
    expect(samples[0].box.y - finalBox.y).toBeGreaterThan(0);
    expect(samples[0].box.y - finalBox.y).toBeLessThanOrEqual(16);
    for (const sample of samples) {
      expect(sample.box.width).toBeCloseTo(finalBox.width, 0);
      expect(sample.box.height).toBeCloseTo(finalBox.height, 0);
      expect(sample.text.width).toBeCloseTo(finalText.width, 0);
      expect(sample.text.height).toBeCloseTo(finalText.height, 0);
    }
    await expect
      .poll(() =>
        transcript.evaluate((element) =>
          Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight),
        ),
      )
      .toBeLessThan(2);
    await expect(bubble).toHaveCSS('opacity', '1');
    await expect(input).toBeFocused();

    // Resetting during an entrance must remove the bubble cleanly.
    await input.fill('One more question');
    await input.press('Enter');
    await page.getByRole('button', { name: 'New chat', exact: true }).click();
    await expect(sent).toHaveCount(0);
    await expect(transcript.locator('.archive-message-user')).toHaveCount(0);
  });
}

import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('long chat transcripts do not extend the page below the footer', async ({ page }) => {
  const css = await readFile('src/app/feature/chat/chat-page/chat-page.component.css', 'utf8');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<!doctype html>
    <style>
      ${css}
      .sr-only {
        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
        overflow: hidden; clip-path: inset(50%); white-space: nowrap; border-width: 0;
      }
    </style>
    <div class="archive-chat-transcript">
      ${Array.from(
        { length: 20 },
        () => `<article style="height: 180px">
          <a href="/events">To event page<span class="sr-only"> for a matching talk</span></a>
        </article>`,
      ).join('')}
    </div>
    <footer style="height: 100px">Footer</footer>
  `);

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const atEnd of [false, true]) {
      const layout = await page.evaluate((atEnd) => {
        const transcript = document.querySelector<HTMLElement>('.archive-chat-transcript')!;
        transcript.scrollTop = atEnd ? transcript.scrollHeight : 0;
        return {
          pageHeight: document.documentElement.scrollHeight,
          expectedHeight: Math.max(
            innerHeight,
            document.querySelector('footer')!.getBoundingClientRect().bottom + scrollY + 8,
          ),
        };
      }, atEnd);
      expect(layout.pageHeight).toBeLessThanOrEqual(Math.ceil(layout.expectedHeight));
    }
  }
});

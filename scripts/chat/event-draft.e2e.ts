import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import axe from 'axe-core';
import { draftFixture } from './draft-fixture';
import {
  eventDraftSaveIssues,
  MEETUP_URL_PLACEHOLDER,
} from '../../src/app/core/models/event-draft.model';

for (const fromChat of [false, true]) {
  test(`edit, review and save private event (from chat: ${fromChat})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    let draft = structuredClone(draftFixture);
    draft.content.startsAt = '2026-11-25T18:30';
    let publishes = 0;
    let stale = true;
    let chatRuns = 0;
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
              id: draftFixture.content.venueId,
              title: 'Constructor Nexademy',
              street: 'Förrlibuckstrasse 150',
              city: 'Zürich',
            },
          ],
          speakers: [
            {
              id: draft.content.talks[0].speakerIds[0],
              first_name: 'Mateusz',
              last_name: 'Halada',
              picture_url: '/fixture-speaker.svg',
            },
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
      if (path.endsWith('/review')) {
        const saveIssues = eventDraftSaveIssues(draft);
        return route.fulfill({
          json: {
            draft,
            saveIssues,
            token: saveIssues.length ? null : `approval-${draft.version}`,
          },
        });
      }
      if (path.endsWith('/save-event')) {
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
          state: 'saved',
          version: draft.version + 1,
          event_slug: 'agentic-angular',
          event_id: crypto.randomUUID(),
        };
        return route.fulfill({ json: draft });
      }
      throw new Error(`Unexpected draft action ${path}`);
    });
    await page.route('**/api/chat/run', (route) => {
      if (++chatRuns === 2) {
        draft = {
          ...draft,
          version: draft.version + 1,
          content: {
            ...draft.content,
            meetupUrl: MEETUP_URL_PLACEHOLDER,
            venueId: '',
            talks: [
              ...draft.content.talks,
              {
                ...draft.content.talks[0],
                id: crypto.randomUUID(),
                title: 'Chat added third talk',
              },
            ],
          },
        };
      }
      const messageId = crypto.randomUUID();
      const events = [
        { type: 'RUN_STARTED', threadId: draft.thread_id, runId: 'draft-run' },
        {
          type: 'CUSTOM',
          name: 'archive_sources',
          value: {
            messageId,
            sources: [],
            result: { kind: 'event_draft', draftId: draft.id, version: draft.version },
          },
        },
        { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: 'Your event draft is saved privately.' },
        { type: 'TEXT_MESSAGE_END', messageId },
        { type: 'RUN_FINISHED', threadId: draft.thread_id, runId: 'draft-run' },
      ];
      return route.fulfill({
        contentType: 'text/event-stream',
        body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
      });
    });
    await page.route('**/fixture-speaker.svg', (route) =>
      route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"><rect width="36" height="36" fill="#777"/></svg>',
      }),
    );
    await page.goto(fromChat ? '/chat' : `/chat?draft=${draft.id}`);
    if (fromChat) {
      await page
        .getByRole('textbox', { name: 'Your question' })
        .fill('Schedule November 25 at half past six in the afternoon');
      await page.getByRole('button', { name: 'Send question' }).click();
    }
    const editor = page.getByRole('region', { name: 'Event drafts', exact: true });
    await expect(
      editor.getByRole('heading', { name: 'Agentic Angular meetup', exact: true }),
    ).toBeVisible();
    await expect(editor.getByText('Change history', { exact: true })).toHaveCount(0);
    await expect(editor.getByLabel('Title', { exact: true })).toHaveValue(draft.content.title);
    await expect(editor.getByRole('textbox', { name: 'Description', exact: true })).toHaveCount(0);
    await expect(editor.getByLabel('Date (Europe/Zurich)', { exact: true })).toContainText(
      '25 Nov 2026',
    );
    await expect(editor.getByLabel('Time (Europe/Zurich)', { exact: true })).toContainText('18:30');
    if (fromChat) {
      await page
        .getByRole('textbox', { name: 'Your question' })
        .fill('Add a talk and a placeholder Meetup link');
      await page.getByRole('button', { name: 'Send question' }).click();
      await expect(editor.getByLabel('Meetup event URL')).toHaveValue(MEETUP_URL_PLACEHOLDER);
      await expect(editor.getByLabel('Talk 3', { exact: true })).toContainText(
        'Chat added third talk',
      );
      await editor.getByRole('button', { name: 'Review event draft' }).click();
      await expect(
        editor.getByRole('heading', { name: 'Complete this draft before saving' }),
      ).toBeFocused();
      await expect(editor).toContainText('Choose a venue.');
      await expect(editor.getByRole('button', { name: 'Save event as draft' })).toBeDisabled();
      expect(publishes).toBe(0);
      await editor.getByRole('button', { name: 'Back to editing' }).click();
      const venue = editor.getByRole('combobox', { name: 'Venue', exact: true });
      await venue.scrollIntoViewIfNeeded();
      await venue.press('ArrowDown');
      await expect(venue).toHaveAttribute('aria-expanded', 'true');
      await venue.press('End');
      await expect(venue).toHaveAttribute('aria-activedescendant', /-option-1$/);
      await venue.press('Enter');
      await expect(venue).toContainText('Constructor Nexademy');
    }
    await editor.getByLabel('Title', { exact: true }).first().fill('Edited meetup title');
    await expect(editor.getByRole('button', { name: 'Review event draft' })).toBeDisabled();
    await expect(editor.getByRole('button', { name: 'Save event details' })).toHaveCount(0);
    await expect(editor.getByRole('status')).toContainText('saved privately');
    const meetupUrl = editor.getByLabel('Meetup event URL');
    await meetupUrl.fill('https://www.meetup.com/angularzrh/events/123456789/');
    const transcript = page.getByRole('log');
    await transcript.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    const scrollBeforeSave = await transcript.evaluate((element) => element.scrollTop);
    await expect(editor.getByRole('status')).toContainText('saved privately');
    expect(await transcript.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(
      scrollBeforeSave - 48,
    );
    await expect(meetupUrl).toBeFocused();
    await editor.getByRole('button', { name: 'Review event draft' }).click();
    await expect(editor.getByRole('heading', { name: 'Save event as draft?' })).toBeFocused();
    await expect(editor).toContainText('Edited meetup title');
    await expect(editor.getByLabel('Description', { exact: true })).toHaveCount(0);
    await expect(editor).not.toContainText('Description for talk 1');
    const meetupLink = editor.getByRole('link', {
      name: /https:\/\/www.meetup.com\/angularzrh\/events\/123456789\//,
    });
    await expect(meetupLink).toHaveAttribute(
      'href',
      'https://www.meetup.com/angularzrh/events/123456789/',
    );
    await expect(meetupLink).toHaveAttribute('target', '_blank');
    await expect(editor.getByRole('img', { name: 'Mateusz Halada' }).first()).toBeVisible();
    await expect
      .poll(() =>
        editor
          .getByRole('img', { name: 'Mateusz Halada' })
          .first()
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(36);
    await expect(editor.locator('.draft-summary-meta')).toContainText('25 Nov 2026');
    await expect(editor.locator('.draft-summary-meta')).toContainText('18:30');
    const summaryFields = editor.locator('.draft-summary-field');
    const titleBounds = await summaryFields.nth(0).boundingBox();
    const startsBounds = await summaryFields.nth(1).boundingBox();
    expect(titleBounds!.y).toBe(startsBounds!.y);
    expect(startsBounds!.x).toBeGreaterThan(titleBounds!.x);
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
    const mobileTitleBounds = await summaryFields.nth(0).boundingBox();
    const mobileStartsBounds = await summaryFields.nth(1).boundingBox();
    expect(mobileStartsBounds!.y).toBeGreaterThanOrEqual(mobileTitleBounds!.y);
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    expect(await violations()).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: 'tmp/event-draft-mobile.png', fullPage: true });
    await editor.getByRole('button', { name: 'Save event as draft' }).click();
    await expect(editor.getByRole('alert')).toContainText('changed');
    expect(publishes).toBe(0);
    await expect(editor.getByRole('button', { name: 'Reload latest version' })).toHaveCount(0);
    await editor.getByRole('button', { name: 'Review event draft' }).click();
    await editor.getByRole('button', { name: 'Save event as draft' }).click();
    await expect(editor.getByRole('link', { name: 'Edit event draft' })).toHaveAttribute(
      'href',
      `/dashboard/events/${draft.event_id}`,
    );
    expect(publishes).toBe(1);
  });
}

import { expect, test, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { environment } from '../../src/environments/environment.development';

const require = createRequire(`${process.cwd()}/package.json`);
const organizerProfiles = [
  { slug: 'mateusz-halada', first_name: 'Mateusz', last_name: 'Halada' },
  { slug: 'tomas-trajan', first_name: 'Tomas', last_name: 'Trajan' },
];

async function prepare(page: Page, authenticated: boolean, dark = false) {
  const origin = new URL(environment.supabaseUrl).origin;
  const project = new URL(origin).hostname.split('.')[0];
  const user = {
    id: '82c8bec4-edc2-45a3-a313-a1570c1513f2',
    email: 'admin@example.com',
    app_metadata: { provider: 'google', providers: ['google'] },
    user_metadata: { full_name: 'Test organizer' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  };
  const accessToken = [
    Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url'),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        role: 'authenticated',
      }),
    ).toString('base64url'),
    'test-signature',
  ].join('.');
  await page.addInitScript(
    ({ key, session, dark }) => {
      localStorage.setItem('theme-dark', String(dark));
      if (session) localStorage.setItem(key, JSON.stringify(session));
      // Exercise widget teardown/restoration without calling the external verification service.
      Object.assign(window, {
        turnstile: {
          render: (container: HTMLElement) => {
            container.dataset['testCaptcha'] = 'rendered';
            return 'test-widget';
          },
          remove: () => undefined,
          reset: () => undefined,
        },
      });
    },
    {
      key: `sb-${project}-auth-token`,
      session: authenticated
        ? {
            access_token: accessToken,
            refresh_token: 'test-refresh',
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: 'bearer',
            user,
          }
        : null,
      dark,
    },
  );
  await page.route(`${origin}/**`, async (route) => {
    const url = route.request().url();
    if (url.includes('/auth/v1/user')) return route.fulfill({ json: user });
    if (url.includes('/rest/v1/organizers_public'))
      return route.fulfill({ json: organizerProfiles });
    // Never send test submissions, emails or mutations to the live backend.
    if (route.request().method() !== 'GET')
      return route.fulfill({ status: 400, json: { error: 'test_request_blocked' } });
    return route.fulfill({ json: [] });
  });
}

async function scan(page: Page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run(): Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> };
      }
    ).axe;
    return (await axe.run()).violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((n) => n.target),
    }));
  });
  expect(violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
}

for (const width of [390, 1440]) {
  for (const dark of [false, true]) {
    test(`organizer and standard form at ${width}px in ${dark ? 'dark' : 'light'} theme`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await prepare(page, true, dark);
      await page.goto('/talk-submission');
      const checkbox = page.getByRole('checkbox', { name: 'Talk given by organizer' });
      await expect(checkbox).toBeVisible();
      await page.getByLabel('First name', { exact: false }).fill('Guest');
      await checkbox.check();
      const select = page.getByRole('combobox', { name: 'Organizer speaker' });
      await expect(select.locator('option')).toHaveCount(3);
      await select.selectOption('mateusz-halada');
      await expect(page.locator('#speakerFirstName')).toHaveCount(0);
      await expect(page.locator('[data-test-captcha]')).toHaveCount(0);
      await select.focus();
      await expect(select).toBeFocused();
      await scan(page);
      await page.screenshot({ path: testInfo.outputPath('organizer-form.png'), fullPage: true });
      await checkbox.uncheck();
      await expect(page.locator('#speakerFirstName')).toHaveValue('Guest');
      await expect(page.locator('[data-test-captcha]')).toHaveCount(1);
      await page.locator('#speakerFirstName').scrollIntoViewIfNeeded();
      await scan(page);
    });
  }
}

test('anonymous visitors see the standard speaker form only', async ({ page }) => {
  await prepare(page, false);
  await page.goto('/talk-submission');
  await expect(page.locator('#speakerFirstName')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Talk given by organizer' })).toHaveCount(0);
});

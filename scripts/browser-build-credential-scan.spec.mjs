import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  assertNoBrowserBuildCredentials,
  findBrowserBuildCredentialViolations,
} from './browser-build-credential-scan.mjs';

function legacyKey(role) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `${header}.${payload}.signature`;
}

async function withBuild(contents, callback) {
  const directory = await mkdtemp(join(tmpdir(), 'angular-zurich-browser-build-'));

  try {
    await Promise.all(
      Object.entries(contents).map(([name, content]) =>
        writeFile(join(directory, name), content, 'utf8'),
      ),
    );
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('accepts browser-safe Supabase credentials', async () => {
  await withBuild(
    {
      'main.js': `const publishable = 'sb_publishable_example';`,
      'legacy.js': `const anon = '${legacyKey('anon')}';`,
    },
    async (directory) => {
      await assert.doesNotReject(assertNoBrowserBuildCredentials(directory));
    },
  );
});

test('reports modern secret keys without printing their values', async () => {
  await withBuild({ 'main.js': "const key = 'sb_secret_sensitive-value';" }, async (directory) => {
    const violations = await findBrowserBuildCredentialViolations(directory);
    assert.deepEqual(
      violations.map(({ kind }) => kind),
      ['Supabase secret key'],
    );
    await assert.rejects(
      assertNoBrowserBuildCredentials(directory),
      (error) =>
        error.message.includes('Supabase secret key') && !error.message.includes('sensitive-value'),
    );
  });
});

test('reports legacy service-role JWTs', async () => {
  await withBuild(
    { 'main.js': `const key = '${legacyKey('service_role')}';` },
    async (directory) => {
      await assert.rejects(assertNoBrowserBuildCredentials(directory), /legacy service-role JWT/);
    },
  );
});

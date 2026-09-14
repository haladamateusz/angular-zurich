import assert from 'node:assert/strict';
import test from 'node:test';

import { assertBrowserSafeSupabaseKey, isBrowserSafeSupabaseKey } from './supabase-browser-key.mjs';

function legacyKey(role) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `${header}.${payload}.signature`;
}

test('accepts browser-safe Supabase keys', () => {
  assert.equal(isBrowserSafeSupabaseKey('sb_publishable_example'), true);
  assert.equal(isBrowserSafeSupabaseKey(legacyKey('anon')), true);
  assert.doesNotThrow(() => assertBrowserSafeSupabaseKey('sb_publishable_example'));
});

test('rejects privileged and malformed Supabase keys', () => {
  for (const key of [
    'sb_secret_example',
    legacyKey('service_role'),
    legacyKey('authenticated'),
    'not-a-supabase-key',
  ]) {
    assert.equal(isBrowserSafeSupabaseKey(key), false);
    assert.throws(() => assertBrowserSafeSupabaseKey(key), /browser build/);
  }
});

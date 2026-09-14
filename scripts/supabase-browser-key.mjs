function getLegacyKeyRole(key) {
  const parts = key.split('.');

  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function isBrowserSafeSupabaseKey(value) {
  const key = value.trim();

  return key.startsWith('sb_publishable_') || getLegacyKeyRole(key) === 'anon';
}

export function assertBrowserSafeSupabaseKey(value) {
  if (!isBrowserSafeSupabaseKey(value)) {
    throw new Error(
      'SUPABASE_KEY must be a publishable key or a legacy anon key; secret and service_role keys cannot be included in a browser build.',
    );
  }
}

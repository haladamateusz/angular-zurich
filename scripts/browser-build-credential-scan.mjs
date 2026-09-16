import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECRET_KEY_PATTERN = /\bsb_secret_[\w-]*/g;
const LEGACY_JWT_PATTERN = /\beyJ[\w-]*\.[\w-]+\.[\w-]+\b/g;

function getLegacyJwtRole(token) {
  const parts = token.split('.');

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

function findCredentialKinds(content) {
  const kinds = [];

  SECRET_KEY_PATTERN.lastIndex = 0;
  if (SECRET_KEY_PATTERN.test(content)) {
    kinds.push('Supabase secret key');
  }

  LEGACY_JWT_PATTERN.lastIndex = 0;
  for (const token of content.matchAll(LEGACY_JWT_PATTERN)) {
    if (getLegacyJwtRole(token[0]) === 'service_role') {
      kinds.push('legacy service-role JWT');
      break;
    }
  }

  return kinds;
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );

  return nestedFiles.flat();
}

export async function findBrowserBuildCredentialViolations(directory) {
  const files = await listFiles(resolve(directory));
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const kind of findCredentialKinds(content)) {
      violations.push({ file, kind });
    }
  }

  return violations;
}

export async function assertNoBrowserBuildCredentials(directory) {
  const violations = await findBrowserBuildCredentialViolations(directory);

  if (violations.length === 0) {
    return;
  }

  const details = violations.map(({ file, kind }) => `- ${kind}: ${file}`).join('\n');
  throw new Error(`Privileged credential found in browser build:\n${details}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await assertNoBrowserBuildCredentials(process.argv[2] ?? 'dist/angular-zurich/browser');
  console.log('Browser build contains no privileged Supabase credentials.');
}

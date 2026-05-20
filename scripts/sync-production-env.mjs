import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const requiredVars = ['SUPABASE_URL', 'SUPABASE_KEY', 'TURNSTILE_SITE_KEY'];
const missingVars = requiredVars.filter((name) => {
  const value = process.env[name];
  return typeof value !== 'string' || value.length === 0;
});

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables for production build: ${missingVars.join(', ')}`,
  );
}

const environmentFilePath = resolve('src/environments/environment.production.ts');
const fileContents = `export const environment = {
  supabaseUrl: ${JSON.stringify(process.env.SUPABASE_URL)},
  supabaseKey: ${JSON.stringify(process.env.SUPABASE_KEY)},
  turnstileSiteKey: ${JSON.stringify(process.env.TURNSTILE_SITE_KEY)},
};
`;

await mkdir(dirname(environmentFilePath), { recursive: true });
await writeFile(environmentFilePath, fileContents, 'utf8');

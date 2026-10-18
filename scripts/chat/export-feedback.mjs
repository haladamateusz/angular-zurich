import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

const feedbackRows = z
  .array(
    z.object({
      user_id: z.string().uuid(),
      message_id: z.string().uuid(),
      question: z.string().min(1).max(2000),
      answer: z.string().max(12000),
      source_ids: z.array(z.string().uuid()).max(10),
      result: z.record(z.unknown()).nullable(),
      updated_at: z.string().datetime({ offset: true }),
    }),
  )
  .max(500);

// A negative rating is evidence of dissatisfaction, never an expected answer.
export function feedbackCandidates(rows, projectUrl, now = new Date()) {
  return {
    version: 1,
    projectUrl: new URL(projectUrl).origin,
    exportedAt: now.toISOString(),
    cases: feedbackRows.parse(rows).map((row) => ({
      id: createHash('sha256')
        .update(`${row.user_id}:${row.message_id}`)
        .digest('hex')
        .slice(0, 24),
      status: 'draft',
      question: row.question,
      standalone: false,
      expectedBehavior: '',
      expectations: null,
      observed: {
        question: row.question,
        answer: row.answer,
        sourceIds: row.source_ids,
        result: row.result,
        feedbackUpdatedAt: row.updated_at,
      },
    })),
  };
}

export async function exportFeedback(output, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 500)
    throw new Error('Use an export limit between 1 and 500.');
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key)
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client
    .from('chat_feedback')
    .select('user_id,message_id,question,answer,source_ids,result,updated_at')
    .eq('rating', 'not_quite')
    .order('updated_at', { ascending: false })
    .order('user_id')
    .order('message_id')
    .limit(limit)
    .abortSignal(AbortSignal.timeout(15_000));
  if (error)
    throw new Error('Could not read feedback. Check the Supabase project and server credential.');
  const candidates = feedbackCandidates(data, url);
  const path = resolve(output);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  // Never overwrite a file that may already contain a human's reviewed expectations.
  await writeFile(path, JSON.stringify(candidates, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { path, count: candidates.cases.length, limit };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        out: { type: 'string', default: 'tmp/chat-feedback/cases.json' },
        limit: { type: 'string', default: '100' },
      },
    });
    const result = await exportFeedback(values.out, Number(values.limit));
    console.log(`Exported ${result.count} draft cases to ${result.path}. No model calls made.`);
    if (result.count === result.limit)
      console.log('Export limit reached; this may not include all feedback.');
    if (!result.count) console.log('No “Not quite” feedback is available yet.');
  } catch (error) {
    console.error(
      error?.code === 'EEXIST'
        ? 'Output already exists. Use --out with a new filename to preserve reviewed cases.'
        : error instanceof Error && error.name === 'Error'
          ? error.message
          : 'Feedback export failed. Check configuration and the output path.',
    );
    process.exitCode = 1;
  }
}

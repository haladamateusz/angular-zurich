import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runArchiveAgent } from '../../src/server/chat/agent';
import { CHAT_MODEL } from '../../src/server/chat/policy';
import { feedbackFileSchema, scoreFeedback, selectFeedbackCases } from './feedback-cases';
import { feedbackEvaluationClient } from './feedback-client';

const path = resolve(process.env['CHAT_FEEDBACK_CASES'] ?? 'tmp/chat-feedback/cases.json');
let raw: unknown;
try {
  if ((await stat(path)).size > 10_000_000) throw new Error('oversized');
  raw = JSON.parse(await readFile(path, 'utf8'));
} catch {
  throw new Error(
    'Provide a JSON case file under 10 MB via CHAT_FEEDBACK_CASES. Run npm run feedback:export first.',
  );
}
const parsed = feedbackFileSchema.safeParse(raw);
if (!parsed.success)
  throw new Error(
    'Invalid feedback cases:\n' +
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n'),
  );
const file = parsed.data;
const live = process.env['CHAT_FEEDBACK_LIVE'] === 'true';
const limit = Number(process.env['CHAT_EVAL_LIMIT'] ?? 6);
const budgetCents = Number(process.env['CHAT_EVAL_BUDGET_CENTS'] ?? 60);
const cases = selectFeedbackCases(file, limit, budgetCents);
const counts = {
  draft: file.cases.filter((item) => item.status === 'draft').length,
  ignored: file.cases.filter((item) => item.status === 'ignored').length,
  ready: file.cases.filter((item) => item.status === 'ready').length,
  selected: cases.length,
};
console.info(
  JSON.stringify({
    mode: live ? 'live feedback evaluation' : 'validation only; no model calls',
    ...counts,
  }),
);

if (!live) {
  it('validates reviewed feedback cases without making database or model calls', () => {
    expect(cases.every((item) => item.standalone && item.expectations)).toBe(true);
  });
} else {
  if (!cases.length)
    throw new Error('No reviewed cases are ready. Add expectations and set status to ready first.');
  const url = process.env['SUPABASE_URL'];
  const publicKey = process.env['SUPABASE_KEY'];
  const token = process.env['CHAT_EVAL_ACCESS_TOKEN'];
  const modelKey = process.env['OPENROUTER_API_KEY'];
  if (!url || !publicKey || !token || !modelKey)
    throw new Error(
      'Live feedback evaluations require SUPABASE_URL, SUPABASE_KEY, CHAT_EVAL_ACCESS_TOKEN (approved user session), and OPENROUTER_API_KEY.',
    );
  if (new URL(url).origin !== new URL(file.projectUrl).origin)
    throw new Error('The case file and SUPABASE_URL must refer to the same project.');
  const client = feedbackEvaluationClient(url, publicKey, token);
  const rows: Record<string, unknown>[] = [];
  const reportDirectory = resolve('tmp/chat-feedback/reports');
  const reportPath = resolve(
    reportDirectory,
    `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID()}.json`,
  );
  const fingerprint = createHash('sha256');
  for (const name of ['agent.ts', 'tools.ts', 'policy.ts', 'context.ts'])
    fingerprint.update(await readFile(resolve('src/server/chat', name)));
  const agentFingerprint = fingerprint.digest('hex');
  let gitCommit = 'unavailable';
  try {
    gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    /* optional metadata */
  }
  let started = false;

  beforeAll(async () => {
    // Check a real approved session; never run model tools with the service-role key.
    const user = await client.auth.getUser(token);
    if (user.error || !user.data.user)
      throw new Error('The evaluation session has expired. Refresh CHAT_EVAL_ACCESS_TOKEN.');
    const approval = await client.rpc('can_current_user_chat');
    if (approval.error || approval.data !== true)
      throw new Error('The evaluation account is not approved for chat.');
    await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
    started = true;
  });

  afterAll(async () => {
    if (!started) return;
    await writeFile(
      reportPath,
      JSON.stringify(
        {
          version: 1,
          evaluatedAt: new Date().toISOString(),
          projectUrl: new URL(url).origin,
          model: CHAT_MODEL,
          gitCommit,
          agentFingerprint,
          budgetCents,
          archive: 'live published records; counts and availability can change',
          ...counts,
          passed: rows.filter((row) => row['status'] === 'passed').length,
          failed: rows.filter((row) => row['status'] === 'failed').length,
          errors: rows.filter((row) => row['status'] === 'error').length,
          cases: rows,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    console.info(`Feedback evaluation report: ${reportPath}`);
  });

  describe.sequential('reviewed feedback against the published archive', () => {
    for (const item of cases)
      it(
        item.id,
        async () => {
          const startedAt = performance.now();
          const tools: string[] = [];
          let answer: Awaited<ReturnType<typeof runArchiveAgent>>;
          try {
            answer = await runArchiveAgent(
              {
                runId: randomUUID(),
                threadId: randomUUID(),
                contextToken: undefined,
                messages: [{ id: randomUUID(), role: 'user', content: item.question }],
              },
              client,
              modelKey,
              AbortSignal.timeout(45_000),
              (activity) => {
                if (activity.state === 'running') tools.push(activity.tool);
              },
            );
          } catch {
            // Provider errors can contain request headers; do not persist raw errors.
            rows.push({
              id: item.id,
              status: 'error',
              question: item.question,
              expectedBehavior: item.expectedBehavior,
              expectations: item.expectations,
              observed: item.observed,
              tools,
              durationMs: Math.round(performance.now() - startedAt),
              error:
                'Agent execution failed or timed out. Check provider availability and session approval.',
            });
            throw new Error(
              `Feedback case ${item.id}: agent execution failed; see the private report.`,
            );
          }
          const score = scoreFeedback(item.expectations!, answer);
          rows.push({
            id: item.id,
            status: score.passed ? 'passed' : 'failed',
            question: item.question,
            expectedBehavior: item.expectedBehavior,
            expectations: item.expectations,
            observed: item.observed,
            questionRewritten: item.question !== item.observed.question,
            actual: {
              answer: answer.text,
              result: answer.result,
              sourceIds: answer.sources.map((source) => source.id),
            },
            checks: score,
            tools,
            providerCalls: answer.providerCalls,
            usage: answer.usage,
            durationMs: Math.round(performance.now() - startedAt),
          });
          // Console output contains case IDs and counts; answer text stays in the ignored report.
          expect(
            score.failures.length,
            `Case ${item.id} failed ${score.failures.length} checks; see the private report.`,
          ).toBe(0);
        },
        50_000,
      );
  });
}

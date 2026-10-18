import { z } from 'zod';
import { ChatResult, chatResultSchema } from '../../src/app/core/models/chat-result.model';

const ids = z.array(z.string().uuid()).max(10);
const snippets = z.array(z.string().trim().min(1).max(300)).max(10);
const expectationsSchema = z
  .object({
    kind: z.enum(['talks', 'stats', 'ranking', 'clarification', 'no_results', 'off_topic']),
    sourceIdsInclude: ids.optional(),
    sourceIdsExclude: ids.optional(),
    total: z.number().int().nonnegative().optional(),
    past: z.number().int().nonnegative().optional(),
    upcoming: z.number().int().nonnegative().optional(),
    ranking: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            rank: z.number().int().positive(),
            talkCount: z.number().int().positive(),
          })
          .strict(),
      )
      .max(10)
      .optional(),
    answerIncludes: snippets.optional(),
    answerExcludes: snippets.optional(),
  })
  .strict()
  .superRefine((expected, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (expected.total !== undefined && !['talks', 'stats'].includes(expected.kind))
      issue('total requires talks or stats.');
    if (
      (expected.past !== undefined || expected.upcoming !== undefined) &&
      expected.kind !== 'stats'
    )
      issue('past/upcoming require stats.');
    if (expected.ranking && expected.kind !== 'ranking') issue('ranking rows require ranking.');
    if (expected.sourceIdsInclude?.some((id) => expected.sourceIdsExclude?.includes(id)))
      issue('A source cannot be both required and forbidden.');
    const factualCheck =
      expected.sourceIdsInclude?.length ||
      expected.sourceIdsExclude?.length ||
      expected.total !== undefined ||
      expected.past !== undefined ||
      expected.upcoming !== undefined ||
      expected.ranking?.length ||
      expected.answerIncludes?.length ||
      expected.answerExcludes?.length;
    if (['talks', 'stats', 'ranking'].includes(expected.kind) && !factualCheck)
      issue('Add at least one factual check; matching the result kind alone is insufficient.');
  });

const caseSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
    status: z.enum(['draft', 'ready', 'ignored']),
    question: z.string().trim().min(1).max(2000),
    standalone: z.boolean(),
    expectedBehavior: z.string().max(2000),
    expectations: expectationsSchema.nullable(),
    observed: z
      .object({
        question: z.string().max(2000),
        answer: z.string().max(12000),
        sourceIds: ids,
        result: chatResultSchema.nullable(),
        feedbackUpdatedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (
      item.status === 'ready' &&
      (!item.standalone || !item.expectations || !item.expectedBehavior.trim())
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Ready cases need a standalone question, expectedBehavior, and expectations.',
      });
  });

export const feedbackFileSchema = z
  .object({
    version: z.literal(1),
    projectUrl: z.string().url(),
    exportedAt: z.string().datetime(),
    cases: z.array(caseSchema).max(500),
  })
  .strict()
  .superRefine((file, ctx) => {
    if (new Set(file.cases.map((item) => item.id)).size !== file.cases.length)
      ctx.addIssue({ code: 'custom', message: 'Case IDs must be unique.' });
  });

export type FeedbackCase = z.infer<typeof caseSchema>;
export interface FeedbackAnswer {
  text: string;
  result: ChatResult;
  sources: { id: string }[];
}

export function scoreFeedback(
  expected: NonNullable<FeedbackCase['expectations']>,
  answer: FeedbackAnswer,
) {
  const failures: string[] = [];
  if (answer.result.kind !== expected.kind)
    failures.push(`Expected ${expected.kind}, received ${answer.result.kind}.`);
  if (!answer.text.trim()) failures.push('Answer is empty.');
  const sources = new Set(answer.sources.map((source) => source.id));
  for (const id of expected.sourceIdsInclude ?? [])
    if (!sources.has(id)) failures.push(`Missing source ${id}.`);
  for (const id of expected.sourceIdsExclude ?? [])
    if (sources.has(id)) failures.push(`Unexpected source ${id}.`);
  for (const field of ['total', 'past', 'upcoming'] as const) {
    if (expected[field] === undefined) continue;
    const actual =
      field in answer.result
        ? (answer.result as unknown as Record<string, unknown>)[field]
        : undefined;
    if (actual !== expected[field])
      failures.push(`Expected ${field}=${expected[field]}, received ${actual ?? 'absent'}.`);
  }
  for (const row of expected.ranking ?? []) {
    const actual =
      answer.result.kind === 'ranking'
        ? answer.result.rows.find((item) => item.id === row.id)
        : undefined;
    if (!actual || actual.rank !== row.rank || actual.talkCount !== row.talkCount)
      failures.push(`Ranking mismatch for ${row.id}.`);
  }
  const normalized = answer.text.toLocaleLowerCase('en');
  for (const text of expected.answerIncludes ?? [])
    if (!normalized.includes(text.toLocaleLowerCase('en')))
      failures.push(`Missing answer text: ${text}`);
  for (const text of expected.answerExcludes ?? [])
    if (normalized.includes(text.toLocaleLowerCase('en')))
      failures.push(`Forbidden answer text: ${text}`);
  return { passed: failures.length === 0, failures };
}

export function selectFeedbackCases(
  file: z.infer<typeof feedbackFileSchema>,
  limit: number,
  budgetCents: number,
) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 20 ||
    !Number.isInteger(budgetCents) ||
    budgetCents < 0 ||
    budgetCents > 200
  )
    throw new Error('Use a limit of 1–20 and a budget of 0–200 cents.');
  const selected = file.cases.filter((item) => item.status === 'ready').slice(0, limit);
  if (budgetCents < selected.length * 10)
    throw new Error('Allow 10 cents per selected case before making model calls.');
  return selected;
}

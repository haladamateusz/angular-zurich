import { describe, expect, it } from 'vitest';
import { createArchiveTools, speakerNameSchema } from '../../src/server/chat/tools';
import { archiveQuerySchema } from '../../src/server/chat/context';
import { evaluationClient, TOMAS } from './eval-fixture';

describe('archive query contracts', () => {
  it('accepts explicit nulls without inventing ID or year filters', async () => {
    const args = archiveQuerySchema.parse({
      mode: 'stats',
      query: 'testing',
      speakerId: null,
      eventId: null,
      fromYear: null,
      toYear: null,
    });
    expect(args.speakerId).toBeUndefined();
    expect(args.toYear).toBeUndefined();
    const tools = createArchiveTools(evaluationClient(), new AbortController().signal);
    await tools.queryArchive(args);
    expect(tools.result()).toMatchObject({ kind: 'stats', total: 1 });
    expect(tools.ready()).toBe(true);
  });
  it('resolves speaker names with null IDs and rejects placeholder IDs', async () => {
    const args = speakerNameSchema.parse({ name: 'Tomas Trajan', speakerId: null });
    const tools = createArchiveTools(evaluationClient(), new AbortController().signal);
    await tools.speakerStats(args);
    expect(tools.result()).toMatchObject({ kind: 'stats', total: 3 });
    expect(tools.context().focusSpeakerId).toBe(TOMAS);
    expect(() =>
      archiveQuerySchema.parse({ speakerId: '00000000-0000-0000-0000-000000000000' }),
    ).toThrow();
  });
  it('serializes competing calls and preserves the first terminal answer', async () => {
    const tools = createArchiveTools(evaluationClient(), new AbortController().signal);
    await Promise.all([
      tools.speakerStats(speakerNameSchema.parse({ name: 'Tomas Trajan' })),
      tools.present({ status: 'off_topic', ids: [] }),
    ]);
    expect(tools.answer()).toContain('Tomas Trajan has 3 talks');
    expect(tools.result().kind).toBe('stats');
  });
  it('does not claim no matches without a successful empty lookup', async () => {
    const tools = createArchiveTools(evaluationClient(), new AbortController().signal);
    await expect(tools.present({ status: 'no_results', ids: [] })).rejects.toThrow();
    expect(() => tools.answer()).toThrow();
  });
});

import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { HistoryPage } from '../../../core/models/chat-history.model';
import { ArchiveChatService } from './archive-chat.service';
import { ChatHistoryService } from './chat-history.service';

const threadId = '11111111-1111-4111-8111-111111111111';
function page(sequence: number, before: number | null, revision = 1): HistoryPage {
  const question = crypto.randomUUID();
  const run = crypto.randomUUID();
  const base = {
    run_id: run,
    status: 'complete' as const,
    payload: { version: 1 as const, sources: [], activity: [] },
    created_at: '2026-11-01T12:00:00Z',
  };
  return {
    thread: {
      id: threadId,
      title: 'Signals',
      revision,
      last_message_at: base.created_at,
      requires_organizer: false,
    },
    messages: [
      { ...base, id: question, sequence, role: 'user', text: 'Question', reply_to: null },
      {
        ...base,
        id: crypto.randomUUID(),
        sequence: sequence + 1,
        role: 'assistant',
        text: `Answer ${sequence}`,
        reply_to: question,
      },
    ],
    before,
    activeRun: null,
  };
}

describe('ArchiveChatService saved conversations', () => {
  const read = vi.fn();
  let service: ArchiveChatService;
  beforeEach(() => {
    read.mockReset();
    TestBed.configureTestingModule({
      providers: [
        ArchiveChatService,
        { provide: AuthService, useValue: { session: signal({ access_token: 'fixture' }) } },
        {
          provide: ChatHistoryService,
          useValue: { read, enabled: signal(true), refresh: vi.fn(), stop: vi.fn() },
        },
      ],
    });
    service = TestBed.inject(ArchiveChatService);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('restores completion, feedback IDs and interrupted answers', async () => {
    const saved = page(1, null);
    read.mockResolvedValue(saved);
    await service.open(threadId);
    expect(service.messages()[1].feedback?.messageId).toBe(saved.messages[1].id);
    expect(service.messages()[1].feedback?.threadId).toBe(threadId);
    saved.messages[1].status = 'interrupted';
    await service.open(threadId, true);
    expect(service.messages()[1].interrupted).toBe('failed');
    expect(service.messages()[1].feedback).toBeUndefined();
  });

  it('keeps newly streamed messages when loading older pages', async () => {
    read.mockResolvedValueOnce(page(41, 41)).mockResolvedValueOnce(page(1, null, 2));
    await service.open(threadId);
    vi.stubGlobal('fetch', async (_url: unknown, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const messageId = crypto.randomUUID();
      const events = [
        { type: 'RUN_STARTED', threadId, runId: body.runId },
        { type: 'CUSTOM', name: 'history_saved', value: { threadId, revision: 2 } },
        { type: 'CUSTOM', name: 'archive_sources', value: { messageId, sources: [] } },
        { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: 'Newly streamed answer' },
        { type: 'TEXT_MESSAGE_END', messageId },
        { type: 'RUN_FINISHED', threadId, runId: body.runId },
      ];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });
    expect(await service.send('A follow-up')).toBe(true);
    await service.loadEarlier();
    expect(service.messages().map((message) => message.text)).toEqual([
      'Question',
      'Answer 1',
      'Question',
      'Answer 41',
      'A follow-up',
      'Newly streamed answer',
    ]);
    expect(service.messages().at(-1)?.feedback?.answer).toBe('Newly streamed answer');
  });

  it('ignores a late response after switching conversations', async () => {
    let resolve!: (value: HistoryPage) => void;
    read.mockReturnValueOnce(
      new Promise<HistoryPage>((done) => {
        resolve = done;
      }),
    );
    const opening = service.open(threadId);
    service.reset();
    resolve(page(1, null));
    await opening;
    expect(service.threadId()).toBeNull();
    expect(service.messages()).toEqual([]);
  });
});

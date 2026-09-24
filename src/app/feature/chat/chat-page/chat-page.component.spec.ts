import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ChatAccessService } from '../../../core/auth/chat-access.service';
import { ArchiveChatService } from '../data-access/archive-chat.service';
import { ChatPageComponent } from './chat-page.component';

describe('ChatPageComponent', () => {
  const session = signal<{
    access_token: string;
    user: { id: string; user_metadata?: Record<string, unknown> };
  } | null>({
    access_token: 'test-token',
    user: { id: 'test-user', user_metadata: { given_name: 'Ada' } },
  });
  const check = vi.fn();

  beforeEach(() => {
    session.set({
      access_token: 'test-token',
      user: { id: 'test-user', user_metadata: { given_name: 'Ada' } },
    });
    check.mockReset().mockResolvedValue('ready');
    TestBed.configureTestingModule({
      imports: [ChatPageComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { session } },
        { provide: ChatAccessService, useValue: { check } },
      ],
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens an approved chat without spending tokens or requesting suggestions', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const fixture = TestBed.createComponent(ChatPageComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('textarea')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.archive-chat-examples')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Who gave a talk about signals?');
    expect(fixture.nativeElement.textContent).not.toContain('Angular Zürich · Members');
    expect(fixture.nativeElement.textContent).not.toContain('A→Z');
    expect(fixture.nativeElement.querySelector('.archive-chat-empty h2')?.textContent).toContain(
      'Which talk are you looking for, Ada?',
    );
    expect(fixture.nativeElement.querySelector('#chat-title')?.className).toContain(
      'tracking-[-0.04em]',
    );
    expect(fixture.nativeElement.querySelector('.archive-chat-header p')?.className).toContain(
      'leading-7',
    );
    const controls = fixture.nativeElement.querySelector('.archive-chat-composer-controls');
    expect(controls?.textContent).toMatch(/New chat\s+Send question/);
    expect(controls?.querySelectorAll('button > svg')).toHaveLength(2);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('keeps activity above each answer, opens during a run and folds when it finishes', async () => {
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                stream = controller;
              },
            }),
            { headers: { 'Content-Type': 'text/event-stream' } },
          ),
      ),
    );
    const fixture = TestBed.createComponent(ChatPageComponent);
    await fixture.whenStable();
    const chat = fixture.debugElement.injector.get(ArchiveChatService);
    const emit = (event: object) =>
      stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
    const pending = chat.send('Who spoke about signals?');
    await vi.waitFor(() => expect(stream).toBeDefined());
    const activity = {
      id: crypto.randomUUID(),
      tool: 'search_talks',
      label: 'Search talks',
      state: 'running',
      detail: 'signals',
    };
    emit({ type: 'RUN_STARTED', threadId: 'thread', runId: 'run' });
    emit({
      type: 'ACTIVITY_SNAPSHOT',
      messageId: activity.id,
      activityType: 'archive_search',
      content: activity,
    });
    await vi.waitFor(() => expect(chat.messages()[1].activity?.steps).toHaveLength(1));
    fixture.detectChanges();
    const disclosure = fixture.nativeElement.querySelector(
      '.archive-chat-transcript .archive-activity',
    ) as HTMLDetailsElement;
    expect(disclosure.open).toBe(true);
    expect(disclosure.textContent).toContain('Search talks');
    expect(
      fixture.nativeElement.querySelector('.archive-chat-composer .archive-activity'),
    ).toBeNull();
    emit({
      type: 'ACTIVITY_SNAPSHOT',
      messageId: activity.id,
      activityType: 'archive_search',
      content: { ...activity, state: 'complete', durationMs: 20 },
    });
    emit({ type: 'TEXT_MESSAGE_START', messageId: 'answer', role: 'assistant' });
    emit({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'answer', delta: 'Here are the talks.' });
    emit({ type: 'TEXT_MESSAGE_END', messageId: 'answer' });
    emit({ type: 'RUN_FINISHED', threadId: 'thread', runId: 'run' });
    stream.close();
    await pending;
    fixture.detectChanges();
    expect(disclosure.open).toBe(false);
    expect(disclosure.nextElementSibling?.textContent).toBe('Here are the talks.');
    disclosure.open = true;
    const previousStream = stream;
    const nextRun = chat.send('And testing?');
    await vi.waitFor(() => expect(stream).not.toBe(previousStream));
    fixture.detectChanges();
    const disclosures = fixture.nativeElement.querySelectorAll('.archive-activity');
    expect(disclosures).toHaveLength(2);
    expect(disclosures[0]).toBe(disclosure);
    expect(disclosure.open).toBe(true);
    expect(disclosures[1].open).toBe(true);
    chat.stop();
    stream.close();
    await nextRun;
    fixture.detectChanges();
    expect(disclosures[1].open).toBe(false);
    expect(disclosures[1].textContent).toContain('stopped');
    expect(disclosure.textContent).toContain('Search talks');
    chat.reset();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.archive-activity')).toBeNull();
  });

  it('renders typed results and preserves context across Stop, but clears it on new chat', async () => {
    const requests: { threadId: string; contextToken?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        requests.push(body);
        const messageId = crypto.randomUUID();
        const result =
          requests.length === 1
            ? {
                kind: 'stats',
                total: 3,
                past: 3,
                upcoming: 0,
                years: [{ year: 2023, past: 3, upcoming: 0 }],
              }
            : {
                kind: 'ranking',
                rows: [{ id: crypto.randomUUID(), name: 'Tomas Trajan', talkCount: 3, rank: 1 }],
              };
        const events = [
          { type: 'RUN_STARTED', runId: body.runId, threadId: body.threadId },
          { type: 'CUSTOM', name: 'archive_sources', value: { messageId, sources: [], result } },
          { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
          { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: 'Verified archive results.' },
          { type: 'TEXT_MESSAGE_END', messageId },
          { type: 'STATE_SNAPSHOT', snapshot: { contextToken: 'opaque-test-context' } },
          { type: 'RUN_FINISHED', runId: body.runId, threadId: body.threadId },
        ];
        return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      }),
    );
    const fixture = TestBed.createComponent(ChatPageComponent);
    await fixture.whenStable();
    const chat = fixture.debugElement.injector.get(ArchiveChatService);
    await chat.send('Count Tomas talks');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('table caption').textContent).toContain('by year');
    expect(fixture.nativeElement.querySelector('table tbody').textContent).toContain('2023');
    chat.stop();
    await chat.send('Who gave the most talks?');
    fixture.detectChanges();
    expect(requests[1].threadId).toBe(requests[0].threadId);
    expect(requests[1].contextToken).toBe('opaque-test-context');
    expect(fixture.nativeElement.querySelectorAll('table')[1].textContent).toContain(
      'Tomas Trajan',
    );
    chat.reset();
    await chat.send('Start over');
    expect(requests[2].threadId).not.toBe(requests[0].threadId);
    expect(requests[2].contextToken).toBeUndefined();
  });

  it('removes the conversation when the user signs out', async () => {
    const fixture = TestBed.createComponent(ChatPageComponent);
    await fixture.whenStable();
    session.set(null);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Approved accounts only');
  });

  it('does not create a chat for unapproved users', async () => {
    check.mockResolvedValue('forbidden');
    const fixture = TestBed.createComponent(ChatPageComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Approved accounts only');
  });

  it('explains pending setup without exposing server configuration', async () => {
    check.mockResolvedValue('setup');
    const fixture = TestBed.createComponent(ChatPageComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Your account has access');
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });
});

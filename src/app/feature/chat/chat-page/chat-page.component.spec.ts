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
    vi.useRealTimers();
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
    expect(
      fixture.nativeElement.querySelector('.archive-chat-mascot img')?.getAttribute('src'),
    ).toBe('/angular-mascots/Google_Angular_Mascot_2D_Orthos_Front_Wave.svg');
    expect(fixture.nativeElement.querySelector('#chat-title')?.textContent.trim()).toBe(
      'Chräungie',
    );
    expect(
      fixture.nativeElement.querySelector('.archive-chat-mascot')?.closest('[role=log]'),
    ).toBeNull();
    expect(fixture.nativeElement.querySelector('.archive-chat-empty img')).toBeNull();
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
      fixture.nativeElement.querySelector('.archive-chat-mascot img')?.getAttribute('src'),
    ).toBe('/angular-mascots/Google_Angular_Mascot_2D_Question_Thinking.svg');
    expect(
      fixture.nativeElement.querySelector('.archive-chat-mascot img')?.getAttribute('width'),
    ).toBe('128');
    expect(
      fixture.nativeElement.querySelector('.archive-chat-mascot source')?.getAttribute('srcset'),
    ).toBe('/angular-mascots/Google_Angular_Mascot_2D_Question.svg');
    expect(fixture.nativeElement.querySelector('.archive-chat-mascot-status')).toBeNull();
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
    await vi.waitFor(() => expect(chat.messages()[1].text).toBe('Here are the talks.'));
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.archive-chat-mascot img')?.getAttribute('src'),
    ).toBe('/angular-mascots/Google_Angular_Mascot_2D_Coding_Animated.svg');
    expect(
      fixture.nativeElement.querySelector('.archive-chat-mascot source')?.getAttribute('srcset'),
    ).toBe('/angular-mascots/Google_Angular_Mascot_2D_Coding.svg');
    expect(fixture.nativeElement.querySelector('.archive-chat-mascot-status')).toBeNull();
    emit({ type: 'TEXT_MESSAGE_END', messageId: 'answer' });
    emit({ type: 'RUN_FINISHED', threadId: 'thread', runId: 'run' });
    stream.close();
    await pending;
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.archive-chat-mascot img')?.getAttribute('src'),
    ).toBe('/angular-mascots/Google_Angular_Mascot_2D_Orthos_Front_Wave.svg');
    expect(
      fixture.nativeElement.querySelector('.archive-chat-mascot img')?.getAttribute('width'),
    ).toBe('128');
    expect(fixture.nativeElement.querySelector('.archive-chat-mascot-status')).toBeNull();
    expect(disclosure.open).toBe(false);
    expect(disclosure.nextElementSibling?.textContent?.trim()).toBe('Here are the talks.');
    disclosure.open = true;
    const previousStream = stream;
    const nextRun = chat.send('And testing?');
    await vi.waitFor(() => expect(stream).not.toBe(previousStream));
    fixture.detectChanges();
    const disclosures = fixture.nativeElement.querySelectorAll('.archive-activity');
    expect(disclosures).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.archive-message-mascot')).toBeNull();
    const assistantMessages = fixture.nativeElement.querySelectorAll(
      '.archive-message:not(.archive-message-user)',
    ) as NodeListOf<HTMLElement>;
    expect(assistantMessages).toHaveLength(2);
    for (const message of assistantMessages) {
      expect(message.querySelector('.archive-message-label')).toBeNull();
    }
    expect(
      fixture.nativeElement.querySelector('.archive-chat-mascot img')?.getAttribute('src'),
    ).toBe('/angular-mascots/Google_Angular_Mascot_2D_Question_Thinking.svg');
    expect(fixture.nativeElement.querySelectorAll('.archive-chat-mascot-status')).toHaveLength(0);
    expect(disclosures[0]).toBe(disclosure);
    expect(disclosure.open).toBe(true);
    expect(disclosures[1].open).toBe(true);
    chat.stop();
    stream.close();
    await nextRun;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.archive-chat-mascot-status')).toBeNull();
    expect(disclosures[1].open).toBe(false);
    expect(disclosures[1].textContent).toContain('stopped');
    expect(disclosure.textContent).toContain('Search talks');
    chat.reset();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.archive-activity')).toBeNull();
  });

  it.each(['text', 'sources', 'result', 'writing'] as const)(
    'starts coding immediately when %s arrives before the thinking loop ends',
    async (output) => {
      const fixture = TestBed.createComponent(ChatPageComponent);
      await fixture.whenStable();
      const chat = fixture.debugElement.injector.get(ArchiveChatService);
      const mascotSrc = () =>
        fixture.nativeElement.querySelector('.archive-chat-mascot img')?.getAttribute('src');
      chat.running.set(true);
      chat.messages.set([
        { id: 'answer', role: 'assistant', text: '', sources: [], nextQuestion: '' },
      ]);
      await fixture.whenStable();
      expect(mascotSrc()).toContain('Question_Thinking.svg');

      if (output === 'writing') chat.writingAnswer.set(true);
      else {
        chat.messages.update((messages) =>
          messages.map((message) => ({
            ...message,
            text: output === 'text' ? 'Here are the talks' : '',
            sources:
              output === 'sources'
                ? [
                    {
                      id: 'talk',
                      title: 'Signals',
                      description: '',
                      eventTitle: 'Angular Zürich',
                      speakers: ['Ada'],
                      date: '2026-06-17',
                      url: '/events/signals',
                    },
                  ]
                : [],
            result: output === 'result' ? { kind: 'ranking', rows: [] } : undefined,
          })),
        );
      }
      await fixture.whenStable();
      expect(mascotSrc()).toContain('Coding_Animated.svg');
      expect(
        fixture.nativeElement.querySelector('.archive-chat-mascot source')?.getAttribute('srcset'),
      ).toContain('Coding.svg');

      chat.running.set(false);
      await fixture.whenStable();
      expect(mascotSrc()).toContain('Orthos_Front_Wave.svg');
      fixture.destroy();
    },
  );

  it('falls back to coding after one thinking loop without reviving stopped runs', async () => {
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
    const mascotSrc = () =>
      fixture.nativeElement.querySelector('.archive-chat-mascot img')?.getAttribute('src');
    vi.useFakeTimers();
    const pending = chat.send('Find talks about signals');
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    await vi.advanceTimersByTimeAsync(4_999);
    fixture.detectChanges();
    expect(mascotSrc()).toBe('/angular-mascots/Google_Angular_Mascot_2D_Question_Thinking.svg');
    expect(
      fixture.nativeElement
        .querySelector('.archive-chat-mascot img')
        ?.style.getPropertyValue('--mascot-scale'),
    ).toBe('1.19');
    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();
    expect(chat.messages()[1].text).toBe('');
    expect(
      fixture.nativeElement.querySelector('.archive-chat-mascot')?.classList.contains('is-active'),
    ).toBe(true);
    expect(mascotSrc()).toBe('/angular-mascots/Google_Angular_Mascot_2D_Coding_Animated.svg');
    expect(
      fixture.nativeElement
        .querySelector('.archive-chat-mascot img')
        ?.style.getPropertyValue('--mascot-scale'),
    ).toBe('1.19');
    expect(fixture.nativeElement.querySelector('.archive-chat-mascot-status')).toBeNull();

    stream.enqueue(
      new TextEncoder().encode(
        `data: ${JSON.stringify({ type: 'RUN_STARTED', threadId: 'thread', runId: 'run' })}\n\n` +
          `data: ${JSON.stringify({ type: 'TEXT_MESSAGE_START', messageId: 'answer', role: 'assistant' })}\n\n` +
          `data: ${JSON.stringify({ type: 'TEXT_MESSAGE_CONTENT', messageId: 'answer', delta: 'Found a talk.' })}\n\n`,
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(mascotSrc()).toBe('/angular-mascots/Google_Angular_Mascot_2D_Coding_Animated.svg');

    chat.stop();
    stream.close();
    await pending;
    fixture.detectChanges();
    expect(mascotSrc()).toBe('/angular-mascots/Google_Angular_Mascot_2D_Orthos_Front_Wave.svg');
    expect(
      fixture.nativeElement
        .querySelector('.archive-chat-mascot img')
        ?.style.getPropertyValue('--mascot-scale'),
    ).toBe('1');

    chat.reset();
    fixture.detectChanges();
    const nextRun = chat.send('And forms?');
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(mascotSrc()).toBe('/angular-mascots/Google_Angular_Mascot_2D_Question_Thinking.svg');
    chat.stop();
    stream.close();
    await nextRun;
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(5_000);
    fixture.detectChanges();
    expect(mascotSrc()).toBe('/angular-mascots/Google_Angular_Mascot_2D_Orthos_Front_Wave.svg');
    fixture.destroy();
  });

  it.each(['complete', 'stop', 'error'] as const)(
    'shows cards before the first token and preserves incremental prose on %s',
    async (outcome) => {
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
      const pending = chat.send('Who spoke about signals?');
      await vi.waitFor(() => expect(stream).toBeDefined());
      const emit = (event: object) =>
        stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      const messageId = crypto.randomUUID();
      emit({ type: 'RUN_STARTED', threadId: 'thread', runId: 'run' });
      emit({
        type: 'CUSTOM',
        name: 'archive_sources',
        value: {
          messageId,
          summary: 'A fixed summary that must not replace the answer.',
          sources: [
            {
              id: crypto.randomUUID(),
              title: 'Signals in practice',
              speakers: ['Ada'],
              description: 'Signals and computed values.',
              eventTitle: 'Angular Zürich 2023',
              date: '2023-11-01',
              url: '/events/2023-meetup',
            },
          ],
        },
      });
      emit({ type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' });
      await vi.waitFor(() => expect(chat.writingAnswer()).toBe(true));
      fixture.detectChanges();
      const card = fixture.nativeElement.querySelector('.archive-source') as HTMLElement;
      expect(card?.textContent).toContain('Signals in practice');
      expect(fixture.nativeElement.querySelector('.archive-activity').open).toBe(false);
      expect(fixture.nativeElement.querySelector('.archive-answer-cursor')).not.toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('A fixed summary');
      emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: 'Ada discussed ' });
      await vi.waitFor(() => expect(chat.messages()[1].text).toBe('Ada discussed '));
      fixture.detectChanges();
      const answer = fixture.nativeElement.querySelector('.archive-answer') as HTMLElement;
      expect(answer.textContent?.startsWith('Ada discussed ')).toBe(true);
      expect(card.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(answer.textContent).toContain('Ada discussed');
      expect(chat.running()).toBe(true);
      expect(fixture.nativeElement.querySelector('app-chat-feedback')).toBeNull();
      emit({ type: 'TEXT_MESSAGE_CONTENT', messageId, delta: '<script>signals</script>.' });
      await vi.waitFor(() =>
        expect(chat.messages()[1].text).toContain('<script>signals</script>.'),
      );
      if (outcome === 'complete') {
        emit({ type: 'TEXT_MESSAGE_END', messageId });
        emit({ type: 'RUN_FINISHED', threadId: 'thread', runId: 'run' });
      } else if (outcome === 'stop') chat.stop();
      else emit({ type: 'RUN_ERROR', message: 'The answer was interrupted.' });
      stream.close();
      await pending;
      fixture.detectChanges();
      expect(chat.running()).toBe(false);
      expect(fixture.nativeElement.querySelector('.archive-answer-cursor')).toBeNull();
      expect(answer.textContent).toContain('Ada discussed <script>signals</script>.');
      expect(answer.textContent?.startsWith('Ada discussed ')).toBe(true);
      expect(answer.querySelector('script')).toBeNull();
      expect(fixture.nativeElement.querySelector('.archive-source')).toBe(card);
      expect(fixture.nativeElement.querySelectorAll('app-chat-feedback')).toHaveLength(
        outcome === 'complete' ? 1 : 0,
      );
      if (outcome !== 'complete')
        expect(fixture.nativeElement.textContent).toContain('may be incomplete');
    },
  );

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

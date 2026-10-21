import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ChatAccessService } from '../../../core/auth/chat-access.service';
import { ArchiveChatService } from '../data-access/archive-chat.service';
import { ChatPageComponent } from './chat-page.component';
import { EventDraftService } from '../data-access/event-draft.service';
import { EventDraft } from '../../../core/models/event-draft.model';

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
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.archive-chat-empty img')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#chat-title')?.className).toContain(
      'tracking-[-0.04em]',
    );
    expect(fixture.nativeElement.querySelector('.archive-chat-header p')?.className).toContain(
      'leading-7',
    );
    const controls = fixture.nativeElement.querySelector('.archive-chat-composer-controls');
    expect(controls?.textContent).toContain('Send question');
    expect(controls?.textContent).not.toContain('New chat');
    expect(controls?.querySelectorAll('button > svg')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.archive-chat-footnote')).toBeNull();
    expect(fixture.nativeElement.querySelector('#archive-question-hint')).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('allows retrying pronunciation when playback fails', async () => {
    const fixture = TestBed.createComponent(ChatPageComponent);
    await fixture.whenStable();
    const audio = fixture.nativeElement.querySelector('audio') as HTMLAudioElement;
    const play = vi.spyOn(audio, 'play').mockRejectedValueOnce(new Error('Playback failed'));
    const button = fixture.nativeElement.querySelector(
      '.archive-pronunciation',
    ) as HTMLButtonElement;
    button.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
      'Couldn’t play the pronunciation',
    );
    expect(button.disabled).toBe(false);

    play.mockImplementation(async () => {
      audio.dispatchEvent(new Event('playing'));
    });
    audio.currentTime = 0.5;
    button.click();
    await fixture.whenStable();
    expect(audio.currentTime).toBe(0);
    expect(button.classList.contains('is-playing')).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    audio.dispatchEvent(new Event('ended'));
    fixture.detectChanges();
    expect(button.classList.contains('is-playing')).toBe(false);
  });

  it.each(['forbidden', 'setup', 'error'])(
    'keeps the header mascot hidden while access is %s',
    async (state) => {
      check.mockResolvedValue(state);
      const fixture = TestBed.createComponent(ChatPageComponent);
      await fixture.whenStable();
      expect(
        fixture.nativeElement.querySelector('.archive-chat-header .archive-chat-mascot'),
      ).toBeNull();
    },
  );

  it('shows an accessible chat skeleton while checking access', async () => {
    let resolveAccess!: (state: string) => void;
    check.mockImplementation(() => new Promise<string>((resolve) => (resolveAccess = resolve)));
    const fixture = TestBed.createComponent(ChatPageComponent);
    fixture.detectChanges();
    const loading = fixture.nativeElement.querySelector('[aria-busy="true"]');
    expect(loading?.getAttribute('role')).toBe('status');
    expect(loading?.querySelectorAll('.app-skeleton')).toHaveLength(5);
    expect(
      fixture.nativeElement.querySelector('.archive-chat-header .archive-chat-mascot'),
    ).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Checking your chat access');
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    resolveAccess('ready');
    await Promise.resolve();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('textarea')).not.toBeNull();
  });

  it('shows New chat during a conversation and restores the centered welcome on reset', async () => {
    const fixture = TestBed.createComponent(ChatPageComponent);
    await fixture.whenStable();
    const chat = fixture.debugElement.injector.get(ArchiveChatService);
    chat.messages.set([{ id: 'question', role: 'user', text: 'Find signals', sources: [] }]);
    fixture.detectChanges();
    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((element) =>
      (element as HTMLButtonElement).textContent?.includes('New chat'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();
    expect(
      fixture.nativeElement.querySelector('.archive-chat-header .archive-chat-mascot'),
    ).not.toBeNull();
    button.click();
    fixture.detectChanges();
    expect(chat.messages()).toHaveLength(0);
    expect(
      fixture.nativeElement.querySelector('.archive-chat-empty .archive-chat-mascot'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('.archive-chat-composer-controls').textContent,
    ).not.toContain('New chat');
  });

  it.each([false, true])(
    'moves the mascot to the header on first send (reduced motion: %s)',
    async (reducedMotion) => {
      const fixture = TestBed.createComponent(ChatPageComponent);
      await fixture.whenStable();
      const chat = fixture.debugElement.injector.get(ArchiveChatService);
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: reducedMotion })),
      );
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.closest('.archive-chat-empty')
          ? new DOMRect(400, 300, 128, 128)
          : new DOMRect(900, 100, 128, 128);
      });
      vi.spyOn(chat, 'send').mockImplementation(async (text) => {
        chat.messages.update((messages) => [
          ...messages,
          { id: crypto.randomUUID(), role: 'user', text, sources: [] },
        ]);
        return true;
      });
      const send = async () => {
        const input = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
        input.value = 'Find signals';
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        fixture.detectChanges();
      };
      await send();
      const mascot = fixture.nativeElement.querySelector(
        '.archive-chat-header .archive-chat-mascot',
      ) as HTMLElement;
      expect(mascot).not.toBeNull();
      expect(mascot.classList.contains('archive-chat-mascot-moving')).toBe(!reducedMotion);
      expect(mascot.style.getPropertyValue('--mascot-flight-x')).toBe(
        reducedMotion ? '' : '-500px',
      );
      expect(mascot.style.getPropertyValue('--mascot-flight-y')).toBe(reducedMotion ? '' : '200px');
      await send();
      expect(fixture.nativeElement.querySelector('.archive-chat-header .archive-chat-mascot')).toBe(
        mascot,
      );
      const reset = Array.from(fixture.nativeElement.querySelectorAll('button')).find((element) =>
        (element as HTMLButtonElement).textContent?.includes('New chat'),
      ) as HTMLButtonElement;
      reset.click();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.archive-chat-mascot-moving')).toBeNull();
      expect(
        fixture.nativeElement.querySelector('.archive-chat-empty .archive-chat-mascot'),
      ).not.toBeNull();
    },
  );

  it.each([false, true])(
    'renders the saved event preview in the conversation (reading earlier messages: %s)',
    async (readingEarlierMessages) => {
      const draftId = crypto.randomUUID();
      const messageId = crypto.randomUUID();
      const draft: EventDraft = {
        id: draftId,
        created_by: crypto.randomUUID(),
        thread_id: crypto.randomUUID(),
        version: 1,
        state: 'draft',
        content: {
          title: 'Angular Zürich November',
          startsAt: '2026-11-18T18:00',
          venueId: '',
          meetupUrl: '',
          imageUrl: '',
          talks: [],
        },
        event_id: null,
        event_slug: null,
        created_at: '2026-10-19T12:00:00Z',
        updated_at: '2026-10-19T12:00:00Z',
      };
      let resolveDraft!: (value: { draft: EventDraft; audit: [] }) => void;
      const load = vi.fn(
        () =>
          new Promise<{ draft: EventDraft; audit: [] }>((resolve) => {
            resolveDraft = resolve;
          }),
      );
      TestBed.overrideProvider(EventDraftService, {
        useValue: { load, options: vi.fn(async () => ({ venues: [], speakers: [], talks: [] })) },
      });
      const events = [
        { type: 'RUN_STARTED', threadId: 'thread', runId: 'run' },
        {
          type: 'CUSTOM',
          name: 'archive_sources',
          value: {
            messageId,
            sources: [],
            result: { kind: 'event_draft', draftId, version: 1 },
          },
        },
        { type: 'TEXT_MESSAGE_START', messageId, role: 'assistant' },
        { type: 'TEXT_MESSAGE_CONTENT', messageId, delta: 'Review and edit below.' },
        { type: 'TEXT_MESSAGE_END', messageId },
        { type: 'RUN_FINISHED', threadId: 'thread', runId: 'run' },
      ];
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
              headers: { 'Content-Type': 'text/event-stream' },
            }),
        ),
      );
      const fixture = TestBed.createComponent(ChatPageComponent);
      await fixture.whenStable();
      const chat = fixture.debugElement.injector.get(ArchiveChatService);
      await chat.send('Prepare an event');
      await fixture.whenStable();
      const preview = fixture.nativeElement.querySelector('app-event-draft-preview') as HTMLElement;
      const transcript = fixture.nativeElement.querySelector(
        '.archive-chat-transcript',
      ) as HTMLElement;
      expect(preview?.closest('[role="log"]')).toBe(transcript);
      expect(preview.textContent).toContain('Loading event drafts');
      expect(load).toHaveBeenCalledWith(draftId);
      vi.spyOn(transcript, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 900, 500));
      vi.spyOn(preview.parentElement!, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(0, 500, 900, 1000),
      );
      transcript.scrollTop = 0;
      if (readingEarlierMessages) {
        Object.defineProperty(transcript, 'scrollHeight', { value: 2000 });
        Object.defineProperty(transcript, 'clientHeight', { value: 500 });
        transcript.dispatchEvent(new Event('scroll'));
      }
      resolveDraft({ draft, audit: [] });
      await Promise.resolve();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(preview.querySelector('h2')?.textContent).toContain('Angular Zürich November');
      expect(preview.textContent).toContain('Review event draft');
      expect(transcript.scrollTop).toBe(readingEarlierMessages ? 0 : 400);
      expect(fixture.nativeElement.querySelectorAll('app-event-draft-preview')).toHaveLength(1);
      const titleInput = preview.querySelector(
        'input[formcontrolname="title"]',
      ) as HTMLInputElement;
      titleInput.value = 'My unsaved event title';
      titleInput.dispatchEvent(new Event('input'));
      chat.running.set(true);
      await fixture.whenStable();
      expect(preview.parentElement?.hidden).toBe(true);
      chat.running.set(false);
      await fixture.whenStable();
      expect(preview.parentElement?.hidden).toBe(false);
      expect(fixture.nativeElement.querySelector('app-event-draft-preview')).toBe(preview);
      expect(titleInput.value).toBe('My unsaved event title');
    },
  );

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
      chat.messages.set([{ id: 'answer', role: 'assistant', text: '', sources: [] }]);
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

  it.each(['stats', 'ranking', 'talks'] as const)(
    'shows individual talk cards only when the %s result has no table',
    async (kind) => {
      const fixture = TestBed.createComponent(ChatPageComponent);
      await fixture.whenStable();
      const chat = fixture.debugElement.injector.get(ArchiveChatService);
      chat.messages.set([
        {
          id: 'answer',
          role: 'assistant',
          text: 'Here are the matching results.',
          result:
            kind === 'stats'
              ? {
                  kind,
                  total: 1,
                  past: 1,
                  upcoming: 0,
                  years: [{ year: 2026, past: 1, upcoming: 0 }],
                }
              : kind === 'ranking'
                ? { kind, rows: [{ id: 'speaker', name: 'Ada', talkCount: 1, rank: 1 }] }
                : { kind, total: 1 },
          sources: [
            {
              id: 'talk',
              title: 'Signals in practice',
              speakers: ['Ada'],
              description: '',
              eventTitle: 'Angular Zürich',
              date: '2026-06-17',
              url: '/events/signals',
            },
          ],
        },
      ]);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.archive-results-table')).toHaveLength(
        kind === 'talks' ? 0 : 1,
      );
      expect(fixture.nativeElement.querySelectorAll('.archive-source')).toHaveLength(
        kind === 'talks' ? 1 : 0,
      );
      expect(fixture.nativeElement.querySelector('.archive-answer')?.textContent).toContain(
        'Here are the matching results.',
      );
      expect(chat.messages()[0].sources).toHaveLength(1);
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

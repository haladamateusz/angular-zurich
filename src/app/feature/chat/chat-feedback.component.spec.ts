import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { ChatFeedbackContext } from '../../core/models/chat-feedback.model';
import { ChatFeedbackComponent } from './chat-feedback.component';
import { ChatFeedbackService } from './data-access/chat-feedback.service';

describe('ChatFeedbackComponent', () => {
  const session = signal<{ access_token: string; user: { id: string } } | null>(null);
  const context: ChatFeedbackContext = {
    threadId: crypto.randomUUID(),
    messageId: crypto.randomUUID(),
    question: 'Which talks cover signals?',
    answer: 'Signals in practice.',
    sourceIds: [crypto.randomUUID()],
    result: { kind: 'talks', total: 1 },
  };

  beforeEach(() => {
    session.set({ access_token: 'test-token', user: { id: 'test-user' } });
    TestBed.configureTestingModule({
      imports: [ChatFeedbackComponent],
      providers: [{ provide: AuthService, useValue: { session } }],
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  async function setup() {
    const fixture = TestBed.createComponent(ChatFeedbackComponent);
    fixture.componentRef.setInput('context', context);
    await fixture.whenStable();
    return { fixture, service: fixture.debugElement.injector.get(ChatFeedbackService) };
  }

  it('persists a vote, switches it, and removes it without making a model request', async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        expect(url).toBe('/api/chat/feedback');
        expect(new Headers(init.headers).get('Authorization')).toBe('Bearer test-token');
        const body = JSON.parse(String(init.body));
        requests.push(body);
        return Response.json({ rating: body.rating });
      }),
    );
    const { fixture, service } = await setup();
    expect(requests).toHaveLength(0);
    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    buttons[0].click();
    await vi.waitFor(() => expect(service.rating()).toBe('useful'));
    await fixture.whenStable();
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
    expect(fixture.nativeElement.textContent).toContain('Thanks for your feedback.');
    buttons[1].click();
    await vi.waitFor(() => expect(service.rating()).toBe('not_quite'));
    await fixture.whenStable();
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    fixture.nativeElement.querySelector('.feedback-remove').click();
    await vi.waitFor(() => expect(service.rating()).toBeNull());
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('Feedback removed.');
    expect(requests).toEqual(
      ['useful', 'not_quite', null].map((rating) => ({ ...context, rating })),
    );
  });

  it('keeps the saved vote on failure and allows retry without blocking the chat', async () => {
    let fail = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) =>
        fail
          ? Response.json({}, { status: 503 })
          : Response.json({ rating: JSON.parse(String(init.body)).rating }),
      ),
    );
    const { fixture, service } = await setup();
    await service.save(context, 'useful');
    fail = true;
    await service.save(context, 'not_quite');
    await fixture.whenStable();
    expect(service.rating()).toBe('useful');
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'try again',
    );
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(false);
    fail = false;
    await service.save(context, 'not_quite');
    await fixture.whenStable();
    expect(service.rating()).toBe('not_quite');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('ignores duplicate clicks and aborts pending feedback when its answer is removed', async () => {
    let complete!: (value: Response) => void;
    let requestSignal: AbortSignal | undefined;
    const fetchSpy = vi.fn((_url: string, init: RequestInit) => {
      requestSignal = init.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    });
    vi.stubGlobal('fetch', fetchSpy);
    const { fixture, service } = await setup();
    const pending = service.save(context, 'useful');
    await service.save(context, 'not_quite');
    await fixture.whenStable();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('button').disabled).toBe(true);
    fixture.destroy();
    expect(requestSignal?.aborted).toBe(true);
    complete(Response.json({ rating: 'useful' }));
    await pending;
    expect(service.rating()).toBeNull();
  });

  it('requires a signed-in session before sending feedback', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { service } = await setup();
    session.set(null);
    await service.save(context, 'useful');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(service.error()).toContain('Sign in again');
  });
});

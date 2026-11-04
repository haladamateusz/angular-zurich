import { Service, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import {
  ChatThread,
  HistoryPage,
  historyListSchema,
  historyPageSchema,
  chatThreadSchema,
} from '../../../core/models/chat-history.model';

class ChatHistoryRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

@Service()
export class ChatHistoryService {
  private readonly auth = inject(AuthService);
  private generation = 0;
  readonly enabled = signal(false);
  readonly items = signal<ChatThread[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly revoked = signal(false);

  reset() {
    this.generation++;
    this.items.set([]);
    this.cursor.set(null);
    this.error.set('');
    this.loading.set(false);
    this.enabled.set(false);
    this.revoked.set(false);
  }

  async request(path: string, options: RequestInit = {}): Promise<unknown> {
    const session = this.auth.session();
    if (!session) throw new ChatHistoryRequestError('Sign in again to open your chats.', 401);
    const response = await fetch(`/api/chat${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      signal: AbortSignal.any([
        AbortSignal.timeout(15_000),
        ...(options.signal ? [options.signal] : []),
      ]),
    });
    if (session.user.id !== this.auth.session()?.user.id)
      throw new DOMException('Account changed', 'AbortError');
    if (response.status === 401 || response.status === 403) this.revoked.set(true);
    const body: unknown = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok)
      throw new ChatHistoryRequestError(
        body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : 'Your chats could not be loaded. Please try again.',
        response.status,
      );
    return body;
  }

  async refresh(more = false) {
    const generation = ++this.generation;
    const cursor = more ? this.cursor() : null;
    this.loading.set(true);
    this.error.set('');
    try {
      const data = historyListSchema.parse(
        await this.request(`/threads${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`),
      );
      if (generation !== this.generation) return;
      this.enabled.set(data.enabled);
      this.items.set(
        more
          ? [
              ...this.items(),
              ...data.items.filter((item) => !this.items().some((old) => old.id === item.id)),
            ]
          : data.items,
      );
      this.cursor.set(data.cursor);
    } catch (error) {
      if (generation === this.generation)
        this.error.set(error instanceof Error ? error.message : 'Your chats could not be loaded.');
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }

  async read(id: string, before?: number, signal?: AbortSignal): Promise<HistoryPage> {
    return historyPageSchema.parse(
      await this.request(
        `/threads/${encodeURIComponent(id)}/messages${before ? `?before=${before}` : ''}`,
        { signal },
      ),
    );
  }

  async rename(thread: ChatThread, title: string) {
    const updated = chatThreadSchema.parse(
      await this.request(`/threads/${thread.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title, revision: thread.revision }),
      }),
    );
    this.items.update((items) => items.map((item) => (item.id === thread.id ? updated : item)));
    return updated;
  }

  async remove(id: string) {
    await this.request(`/threads/${id}`, { method: 'DELETE' });
    this.items.update((items) => items.filter((item) => item.id !== id));
  }

  async stop(threadId: string, runId: string) {
    await this.request(`/threads/${threadId}/runs/${runId}/stop`, { method: 'POST', body: '{}' });
  }
}

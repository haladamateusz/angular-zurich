import { DestroyRef, Service, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { ChatFeedbackContext, ChatFeedbackRating } from '../../../core/models/chat-feedback.model';

@Service()
export class ChatFeedbackService {
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly controller = new AbortController();
  readonly rating = signal<ChatFeedbackRating | null>(null);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly status = signal('');

  constructor() {
    this.destroyRef.onDestroy(() => this.controller.abort());
  }

  async save(context: ChatFeedbackContext, rating: ChatFeedbackRating | null) {
    if (this.saving() || (rating === this.rating() && !this.error())) return;
    const session = this.auth.session();
    if (!session) {
      this.error.set('Sign in again to leave feedback.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.status.set('Saving feedback…');
    try {
      const response = await fetch('/api/chat/feedback', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...context, rating }),
        signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(10_000)]),
      });
      if (response.status === 401 || response.status === 403)
        throw new Error('Sign in with an approved account to leave feedback.');
      if (!response.ok) throw new Error('We couldn’t save your feedback. Please try again.');
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || !('rating' in data) || data.rating !== rating)
        throw new Error('We couldn’t confirm your feedback was saved. Please try again.');
      if (this.destroyRef.destroyed || this.auth.session()?.user.id !== session.user.id) return;
      this.rating.set(rating);
      this.status.set(rating === null ? 'Feedback removed.' : 'Thanks for your feedback.');
    } catch (error) {
      if (this.destroyRef.destroyed || this.auth.session()?.user.id !== session.user.id) return;
      this.error.set(
        error instanceof Error && error.name === 'Error'
          ? error.message
          : 'We couldn’t save your feedback. Please try again.',
      );
      this.status.set('');
    } finally {
      if (!this.destroyRef.destroyed) this.saving.set(false);
    }
  }
}

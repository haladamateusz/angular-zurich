import { Injectable, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import {
  EventDraft,
  EventDraftAudit,
  EventDraftOptions,
  EventDraftReview,
  eventDraftSchema,
} from '../../../core/models/event-draft.model';

@Injectable({ providedIn: 'root' })
export class EventDraftService {
  private readonly auth = inject(AuthService);
  private async request(path: string, body?: unknown) {
    const token = this.auth.session()?.access_token;
    if (!token) throw new Error('Sign in again to manage event drafts.');
    const response = await fetch(`/api/chat/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(25_000),
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error
          : 'Event drafts are temporarily unavailable. Try again.',
      );
    return data;
  }
  async load(id: string) {
    const result = (await this.request(`drafts/${id}`)) as {
      draft: unknown;
      audit: EventDraftAudit[];
    };
    return { draft: eventDraftSchema.parse(result.draft), audit: result.audit };
  }
  async options() {
    return (await this.request('draft-options')) as EventDraftOptions;
  }
  async change(draft: EventDraft, action: string, data: Record<string, unknown> = {}) {
    return eventDraftSchema.parse(
      await this.request(`drafts/${draft.id}/${action}`, {
        ...data,
        expectedVersion: draft.version,
      }),
    );
  }
  async review(draft: EventDraft): Promise<EventDraftReview> {
    const result = (await this.request(`drafts/${draft.id}/review`, {
      expectedVersion: draft.version,
    })) as { draft: unknown; token: string | null; saveIssues?: string[] };
    return {
      draft: eventDraftSchema.parse(result.draft),
      token: result.token,
      saveIssues: result.saveIssues ?? [],
    };
  }
  async saveEvent(draft: EventDraft, token: string) {
    return this.change(draft, 'save-event', { token, confirmed: true });
  }
}

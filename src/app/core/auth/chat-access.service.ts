import { Service, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

@Service()
export class ChatAccessService {
  private readonly auth = inject(AuthService);
  readonly historyEnabled = signal(false);

  async check(signal?: AbortSignal): Promise<'ready' | 'setup' | 'forbidden'> {
    const token = this.auth.session()?.access_token;
    if (!token) return 'forbidden';
    const response = await fetch('/api/chat/access', {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
    if (response.status === 401 || response.status === 403) return 'forbidden';
    if (!response.ok) throw new Error('access_unavailable');
    const data: unknown = await response.json();
    if (
      typeof data !== 'object' ||
      data === null ||
      !('approved' in data) ||
      data.approved !== true
    )
      return 'forbidden';
    this.historyEnabled.set('historyEnabled' in data && data.historyEnabled === true);
    return 'available' in data && data.available === true ? 'ready' : 'setup';
  }
}

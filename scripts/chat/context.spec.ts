import { describe, expect, it, vi, afterEach } from 'vitest';
import { openContext, sealContext } from '../../src/server/chat/context';

const user = crypto.randomUUID();
const thread = crypto.randomUUID();
const secret = 'test-only-server-secret';
const context = { speakers: [{ id: crypto.randomUUID(), name: 'Tomas Trajan' }], events: [] };
afterEach(() => vi.useRealTimers());
describe('server-issued conversation context', () => {
  it('round-trips verified context without exposing its contents', () => {
    const token = sealContext(context, user, thread, secret);
    expect(token).not.toContain('Tomas');
    expect(openContext(token, user, thread, secret)).toEqual(context);
  });
  it('rejects tampering, another user, another thread, and a different server key', () => {
    const token = sealContext(context, user, thread, secret);
    const bytes = Buffer.from(token, 'base64url');
    bytes[30] ^= 1;
    expect(() => openContext(bytes.toString('base64url'), user, thread, secret)).toThrow(
      'invalid_context',
    );
    expect(() => openContext(token, crypto.randomUUID(), thread, secret)).toThrow();
    expect(() => openContext(token, user, crypto.randomUUID(), secret)).toThrow();
    expect(() => openContext(token, user, thread, 'another-secret')).toThrow();
  });
  it('drops expired context and starts an empty conversation', () => {
    vi.useFakeTimers();
    const token = sealContext(context, user, thread, secret);
    vi.advanceTimersByTime(30 * 60_000 + 1);
    expect(openContext(token, user, thread, secret)).toEqual({ speakers: [], events: [] });
  });
});

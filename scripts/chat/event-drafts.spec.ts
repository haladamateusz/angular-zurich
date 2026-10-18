import { describe, it, expect } from 'vitest';
import { approvalToken, verifyApproval } from '../../src/server/chat/event-drafts';
import { draftFixture } from './draft-fixture';

describe('event publication approval', () => {
  const secret = 'server-only-test-key';
  it('binds approval to the exact draft, version, actor and expiry', () => {
    const token = approvalToken(draftFixture, draftFixture.created_by, secret);
    expect(() =>
      verifyApproval(token, draftFixture.id, 3, draftFixture.created_by, secret),
    ).not.toThrow();
    expect(() =>
      verifyApproval(token, crypto.randomUUID(), 3, draftFixture.created_by, secret),
    ).toThrow();
    expect(() =>
      verifyApproval(token, draftFixture.id, 4, draftFixture.created_by, secret),
    ).toThrow();
    expect(() => verifyApproval(token, draftFixture.id, 3, crypto.randomUUID(), secret)).toThrow();
    expect(() =>
      verifyApproval(token, draftFixture.id, 3, draftFixture.created_by, 'wrong-key'),
    ).toThrow();
    const expired = approvalToken(draftFixture, draftFixture.created_by, secret, Date.now() - 1);
    expect(() =>
      verifyApproval(expired, draftFixture.id, 3, draftFixture.created_by, secret),
    ).toThrow();
  });
  it.each(['', 'yes', 'confirmed=true', 'e30=.invalid', 'a.b.c'])(
    'rejects invented approval %s',
    (token) => {
      expect(() =>
        verifyApproval(token, draftFixture.id, 3, draftFixture.created_by, secret),
      ).toThrow();
    },
  );
});

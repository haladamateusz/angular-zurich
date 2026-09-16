import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TalkSubmissionDeviceAuthService } from './talk-submission-device-auth.service';

describe('TalkSubmissionDeviceAuthService', () => {
  const storageKey = 'angular-zurich-talk-submission-edit-tokens';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [TalkSubmissionDeviceAuthService, { provide: PLATFORM_ID, useValue: 'browser' }],
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('retains separate credentials and replaces a token only for its submission', () => {
    const auth = TestBed.inject(TalkSubmissionDeviceAuthService);
    auth.storeEditToken('first', 'old-token');
    auth.storeEditToken('second', 'second-token');
    auth.storeEditToken('first', 'new-token');
    expect(auth.getEditToken('first')).toBe('new-token');
    expect(auth.getEditToken('second')).toBe('second-token');
    expect(auth.hasEditToken('unknown')).toBe(false);
    expect(auth.getEditToken(null)).toBeNull();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [TalkSubmissionDeviceAuthService] });
    expect(TestBed.inject(TalkSubmissionDeviceAuthService).getEditToken('first')).toBe('new-token');
  });

  it.each(['broken JSON', 'null', '[]', '42', '{"first":123}'])(
    'ignores invalid persisted credentials: %s',
    (raw) => {
      localStorage.setItem(storageKey, raw);
      const auth = TestBed.inject(TalkSubmissionDeviceAuthService);
      expect(auth.getEditToken('first')).toBeNull();
      auth.storeEditToken('first', 'replacement');
      expect(auth.getEditToken('first')).toBe('replacement');
    },
  );

  it('does not persist empty credentials', () => {
    const auth = TestBed.inject(TalkSubmissionDeviceAuthService);
    auth.storeEditToken('', 'token');
    auth.storeEditToken('first', '');
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it('does not access browser storage during server rendering', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const auth = TestBed.inject(TalkSubmissionDeviceAuthService);
    auth.storeEditToken('first', 'token');
    expect(auth.getEditToken('first')).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

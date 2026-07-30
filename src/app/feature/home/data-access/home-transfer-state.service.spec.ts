import { makeStateKey, PLATFORM_ID, TransferState } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeTransferStateService } from './home-transfer-state.service';

const TEST_STATE_KEY = makeStateKey<{ value: string }>('home.test');

describe('HomeTransferStateService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('stores server-loaded data in TransferState', async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });
    const service = TestBed.inject(HomeTransferStateService);
    const transferState = TestBed.inject(TransferState);
    const loader = vi.fn().mockResolvedValue({ value: 'from-server' });

    await expect(service.load(TEST_STATE_KEY, loader)).resolves.toEqual({ value: 'from-server' });

    expect(loader).toHaveBeenCalledOnce();
    expect(transferState.get(TEST_STATE_KEY, { value: '' })).toEqual({ value: 'from-server' });
  });

  it('uses and removes transferred data in the browser', async () => {
    const transferState = new TransferState();
    transferState.set(TEST_STATE_KEY, { value: 'from-server' });

    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: TransferState, useValue: transferState },
      ],
    });
    const service = TestBed.inject(HomeTransferStateService);
    const loader = vi.fn().mockResolvedValue({ value: 'from-browser' });

    await expect(service.load(TEST_STATE_KEY, loader)).resolves.toEqual({ value: 'from-server' });

    expect(loader).not.toHaveBeenCalled();
    expect(transferState.hasKey(TEST_STATE_KEY)).toBe(false);
  });
});

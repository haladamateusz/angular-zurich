import { TestBed } from '@angular/core/testing';

import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    service.clear();
    vi.useRealTimers();
  });

  it('adds a success toast with the supplied options', () => {
    const id = service.success('Event saved', { duration: 3_000, title: 'Saved' });

    expect(service.toasts()).toEqual([
      {
        dismissible: true,
        dismissing: false,
        duration: 3_000,
        id,
        message: 'Event saved',
        title: 'Saved',
        variant: 'success',
      },
    ]);
  });

  it('removes a toast after its duration elapses', () => {
    vi.useFakeTimers();
    service.warning('Draft is not published', { duration: 1_000 });

    vi.advanceTimersByTime(1_000);
    expect(service.toasts()).toHaveLength(1);

    vi.advanceTimersByTime(180);

    expect(service.toasts()).toEqual([]);
  });

  it('keeps persistent toasts until they are dismissed', () => {
    vi.useFakeTimers();
    const id = service.error('Unable to save', { duration: 0 });

    vi.advanceTimersByTime(10_000);
    expect(service.toasts()).toHaveLength(1);

    service.dismiss(id);
    expect(service.toasts()[0]?.dismissing).toBe(true);

    vi.advanceTimersByTime(180);
    expect(service.toasts()).toEqual([]);
  });
});

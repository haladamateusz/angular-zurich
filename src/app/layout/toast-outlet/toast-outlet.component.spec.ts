import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ToastService } from '../../core/toast/toast.service';
import { ToastOutletComponent } from './toast-outlet.component';

describe('ToastOutletComponent', () => {
  let fixture: ComponentFixture<ToastOutletComponent>;
  let toastService: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToastOutletComponent],
    }).compileComponents();

    toastService = TestBed.inject(ToastService);
    fixture = TestBed.createComponent(ToastOutletComponent);
    await fixture.whenStable();
  });

  afterEach(() => {
    toastService.clear();
    vi.useRealTimers();
  });

  it('renders an accessible error toast', async () => {
    toastService.error('Please try again.', { title: 'Could not save' });

    await fixture.whenStable();

    const toast = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
    expect(toast?.getAttribute('aria-live')).toBe('assertive');
    expect(toast?.textContent).toContain('Could not save');
    expect(toast?.textContent).toContain('Please try again.');
  });

  it('dismisses a toast from its close button', async () => {
    toastService.success('Event saved', { duration: 0 });
    await fixture.whenStable();

    const dismissButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement | null;
    dismissButton?.click();
    expect(toastService.toasts()[0]?.dismissing).toBe(true);

    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[role="status"]')).toBeNull();
  });
});

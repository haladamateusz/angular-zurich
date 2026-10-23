import { TestBed } from '@angular/core/testing';
import { ErrorNoticeComponent } from './error-notice.component';

describe('ErrorNoticeComponent', () => {
  it('announces plain error text without injecting markup or requiring an action', async () => {
    const fixture = TestBed.createComponent(ErrorNoticeComponent);
    fixture.componentRef.setInput('message', '<script>Network unavailable</script>');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.getAttribute('role')).toBe('alert');
    expect(host.getAttribute('aria-atomic')).toBe('true');
    expect(host.textContent).toContain('<script>Network unavailable</script>');
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('button')).toBeNull();
    expect(host.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('delegates recovery to the feature and prevents duplicate actions while disabled', async () => {
    const fixture = TestBed.createComponent(ErrorNoticeComponent);
    fixture.componentRef.setInput('title', 'Events unavailable');
    fixture.componentRef.setInput('message', 'Try again.');
    fixture.componentRef.setInput('actionLabel', 'Reload events');
    const action = vi.fn();
    fixture.componentInstance.action.subscribe(action);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.type).toBe('button');
    button.click();
    expect(action).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('actionDisabled', true);
    await fixture.whenStable();
    button.click();
    expect(action).toHaveBeenCalledTimes(1);
  });
});

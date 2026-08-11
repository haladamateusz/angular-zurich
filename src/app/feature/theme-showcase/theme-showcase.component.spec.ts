import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ToastService } from '../../core/toast/toast.service';
import { ThemeShowcaseComponent } from './theme-showcase.component';

describe('ThemeShowcaseComponent', () => {
  let component: ThemeShowcaseComponent;
  let fixture: ComponentFixture<ThemeShowcaseComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ThemeShowcaseComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ThemeShowcaseComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the selected toast example', async () => {
    const toastService = TestBed.inject(ToastService);
    const element = fixture.nativeElement as HTMLElement;

    Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Success toast')
      ?.click();
    await fixture.whenStable();

    expect(toastService.toasts()).toContainEqual(
      expect.objectContaining({ message: 'The event changes are live.', variant: 'success' }),
    );

    toastService.clear();
  });
});

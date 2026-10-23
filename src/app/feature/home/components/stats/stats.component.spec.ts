import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatsComponent } from './stats.component';
import { SupabaseService } from '../../../../core/data-access/supabase/supabase.service';

describe('StatsComponent', () => {
  let component: StatsComponent;
  let fixture: ComponentFixture<StatsComponent>;
  let animationFrame: FrameRequestCallback | undefined;
  const supabaseServiceMock = {
    getStatsCounts: async () => ({
      talks: 248,
      speakers: 193,
      events: 81,
    }),
  };

  beforeEach(async () => {
    // Reproduce CI, where a reset browser mock can return no MediaQueryList.
    vi.stubGlobal('matchMedia', vi.fn());
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        animationFrame = callback;
        return 1;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    animationFrame = undefined;
    await TestBed.configureTestingModule({
      imports: [StatsComponent],
      providers: [
        {
          provide: SupabaseService,
          useValue: supabaseServiceMock,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StatsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture?.destroy();
    vi.unstubAllGlobals();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render live stats from the service', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    TestBed.tick();

    const initialValues = Array.from(
      fixture.nativeElement.querySelectorAll('.stats__value'),
      (element: Element) => element.textContent?.trim(),
    );

    expect(initialValues).toEqual(['0', '0', '0']);

    expect(animationFrame).toBeDefined();
    animationFrame!(window.performance.now() + 701);
    fixture.detectChanges();

    const finalValues = Array.from(
      fixture.nativeElement.querySelectorAll('.stats__value'),
      (element: Element) => element.textContent?.trim(),
    );

    expect(finalValues).toEqual(['248', '193', '81']);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatsComponent } from './stats.component';
import { SupabaseService } from '../../services/supabase/supabase.service';

describe('StatsComponent', () => {
  let component: StatsComponent;
  let fixture: ComponentFixture<StatsComponent>;
  const supabaseServiceMock = {
    getStatsCounts: async () => ({
      talks: 248,
      speakers: 193,
      events: 81,
    }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatsComponent],
      providers: [
        {
          provide: SupabaseService,
          useValue: supabaseServiceMock,
        },
      ],
    })
      .compileComponents();

    fixture = TestBed.createComponent(StatsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render live stats from the service', () => {
    fixture.detectChanges();

    const values = Array.from(
      fixture.nativeElement.querySelectorAll('.stats__value'),
      (element: Element) => element.textContent?.trim(),
    );

    expect(values).toEqual(['248', '193', '81']);
  });
});

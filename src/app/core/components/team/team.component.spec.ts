import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { PostgrestResponse } from '@supabase/supabase-js';
import { TeamComponent } from './team.component';
import { Person } from '../../interfaces/person.interface';
import { SupabaseService } from '../../services/supabase/supabase.service';

const EMPTY_PEOPLE_RESPONSE = {
  data: [],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
} satisfies PostgrestResponse<Person>;

describe('TeamComponent', () => {
  let component: TeamComponent;
  let fixture: ComponentFixture<TeamComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamComponent],
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            getOrganizers: vi.fn().mockResolvedValue(EMPTY_PEOPLE_RESPONSE),
            getFormerOrganizers: vi.fn().mockResolvedValue(EMPTY_PEOPLE_RESPONSE),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TeamComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

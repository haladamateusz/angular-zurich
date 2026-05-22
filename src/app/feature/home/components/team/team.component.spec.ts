import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { PostgrestResponse } from '@supabase/supabase-js';
import { TeamComponent } from './team.component';
import { Person } from '../../../../core/models/person.interface';
import { SupabaseService } from '../../../../core/data-access/supabase/supabase.service';

const EMPTY_PEOPLE_RESPONSE = {
  data: [],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
  success: true,
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

  it('renders organizer label under the name', async () => {
    const getOrganizers = vi.fn().mockResolvedValue({
      data: [
        {
          first_name: 'Mateusz',
          last_name: 'Halada',
          slug: 'mateusz-halada',
          picture_url: 'https://example.com/mateusz.jpg',
          label: 'Angular & Nx architecture specialist',
          company_name: null,
          personal_url: null,
          github_url: null,
          twitter_url: null,
          linkedin_url: null,
        },
      ],
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
      success: true,
    } satisfies PostgrestResponse<Person>);

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [TeamComponent],
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            getOrganizers,
            getFormerOrganizers: vi.fn().mockResolvedValue(EMPTY_PEOPLE_RESPONSE),
          },
        },
      ],
    }).compileComponents();

    const labelFixture = TestBed.createComponent(TeamComponent);
    labelFixture.detectChanges();
    await labelFixture.whenStable();
    labelFixture.detectChanges();

    const label = (labelFixture.nativeElement as HTMLElement).querySelector('.member-card__label');

    expect(label?.textContent).toContain('Angular & Nx architecture specialist');
  });
});

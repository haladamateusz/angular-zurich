import { TestBed } from '@angular/core/testing';
import type { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';
import { App } from './app.component';
import { Event } from './core/interfaces/event.interface';
import { Person } from './core/interfaces/person.interface';
import { Sponsor } from './core/interfaces/sponsor.interface';
import { SupabaseService } from './core/services/supabase/supabase.service';

const DEFAULT_EVENT: Event = {
  title: 'Angular Zurich Meetup',
  meetup_url: 'https://www.meetup.com/angularzrh/',
  id: 'event-1',
  talks: [
    {
      id: 'talk-1',
      title: 'Signals in Practice',
      description: 'How signals make state easier to manage.',
      event_id: 'event-1',
      presentation_time: 30,
      created_by: 'organizer',
      speaker_links: [
        {
          speaker: {
            id: 'speaker-1',
            first_name: 'Ada',
            last_name: 'Lovelace',
            picture_url: null,
            label: 'Engineer',
            company_name: 'Angular Zurich',
          },
        },
      ],
    },
  ],
  venue: {
    title: 'Tech Hub',
    city: 'Zurich',
    zip: '8000',
    street: 'Main Street 1',
    google_maps_url: 'https://maps.example.com',
  },
  starts_at: '2099-04-17T18:30:00.000Z',
  venue_id: 'venue-1',
};

const EMPTY_SPONSORS_RESPONSE = {
  data: [],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
} satisfies PostgrestResponse<Sponsor>;

const EMPTY_PEOPLE_RESPONSE = {
  data: [],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
} satisfies PostgrestResponse<Person>;

function createEventResponse(event: Event): PostgrestSingleResponse<Event> {
  return {
    data: event,
    error: null,
    count: null,
    status: 200,
    statusText: 'OK',
  };
}

describe('App', () => {
  let latestEventResponse = createEventResponse(DEFAULT_EVENT);

  beforeEach(async () => {
    latestEventResponse = createEventResponse(DEFAULT_EVENT);
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: '',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: SupabaseService,
          useValue: {
            getLatestEvent: vi.fn(async () => latestEventResponse),
            getSponsors: vi.fn().mockResolvedValue(EMPTY_SPONSORS_RESPONSE),
            getOrganizers: vi.fn().mockResolvedValue(EMPTY_PEOPLE_RESPONSE),
            getFormerOrganizers: vi.fn().mockResolvedValue(EMPTY_PEOPLE_RESPONSE),
            getStatsCounts: vi.fn().mockResolvedValue({
              speakers: 0,
              talks: 0,
              events: 0,
            }),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app).toBeTruthy();
  });

  it('shows the sticky banner and upcoming talks for a future event', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Upcoming Talks');
    expect(compiled.textContent).toContain(DEFAULT_EVENT.title);
  });

  it('hides the sticky banner and upcoming talks for a past event', async () => {
    latestEventResponse = createEventResponse({
      ...DEFAULT_EVENT,
      starts_at: '2020-04-17T18:30:00.000Z',
    });

    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).not.toContain('Upcoming Talks');
    expect(compiled.textContent).not.toContain(DEFAULT_EVENT.title);
  });
});

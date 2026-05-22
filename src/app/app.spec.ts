import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import type { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';
import { App } from './app.component';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { SupabaseService } from './core/data-access/supabase/supabase.service';
import { Event } from './core/models/event.interface';
import { Person } from './core/models/person.interface';
import { Sponsor } from './core/models/sponsor.interface';

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
  success: true,
} satisfies PostgrestResponse<Sponsor>;

const EMPTY_PEOPLE_RESPONSE = {
  data: [],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
  success: true,
} satisfies PostgrestResponse<Person>;

function createEventResponse(event: Event): PostgrestSingleResponse<Event> {
  return {
    data: event,
    error: null,
    count: null,
    status: 200,
    statusText: 'OK',
    success: true,
  };
}

describe('App', () => {
  let latestEventResponse = createEventResponse(DEFAULT_EVENT);
  const isAuthenticated = signal(false);

  beforeEach(async () => {
    latestEventResponse = createEventResponse(DEFAULT_EVENT);
    isAuthenticated.set(false);
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
        provideRouter(routes),
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
        {
          provide: AuthService,
          useValue: {
            isAuthenticated,
            signOut: vi.fn().mockResolvedValue(undefined),
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

  it('shows the hero event preview and upcoming talks for a future event', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Upcoming talks');
    expect(compiled.textContent).toContain(DEFAULT_EVENT.title);
    expect(compiled.textContent).toContain('Next on Angular Zurich');
  });

  it('hides the hero event preview and upcoming talks for a past event', async () => {
    latestEventResponse = createEventResponse({
      ...DEFAULT_EVENT,
      starts_at: '2020-04-17T18:30:00.000Z',
    });

    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).not.toContain('Upcoming Talks');
    expect(compiled.textContent).not.toContain(DEFAULT_EVENT.title);
    expect(compiled.textContent).not.toContain('Next on Angular Zurich');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import type { PostgrestResponse, PostgrestSingleResponse } from '@supabase/supabase-js';
import { App } from './app.component';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { SupabaseService } from './core/data-access/supabase/supabase.service';
import {
  AssignableTalk,
  VenueOption,
} from './core/models/event-management.interface';
import { DashboardEvent, Event } from './core/models/event.interface';
import { OrganizerTalkSubmission } from './core/models/organizer-talk-submission.interface';
import { Person } from './core/models/person.interface';
import { Sponsor } from './core/models/sponsor.interface';

const DEFAULT_EVENT: Event = {
  title: 'Angular Zurich Meetup',
  meetup_url: 'https://www.meetup.com/angularzrh/',
  id: 'event-1',
  slug: 'meetup',
  feature_graphic: null,
  talks: [
    {
      id: 'talk-1',
      title: 'Signals in Practice',
      description: 'How signals make state easier to manage.',
      slides_url: null,
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

const EMPTY_EVENTS_RESPONSE = {
  data: [],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
  success: true,
} satisfies PostgrestResponse<Event>;

const EMPTY_DASHBOARD_EVENTS_RESPONSE = {
  data: [],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
  success: true,
} satisfies PostgrestResponse<DashboardEvent>;

const EMPTY_ASSIGNABLE_TALKS_RESPONSE = {
  data: [],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
  success: true,
} satisfies PostgrestResponse<AssignableTalk>;

const EMPTY_VENUES_RESPONSE = {
  data: [],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
  success: true,
} satisfies PostgrestResponse<VenueOption>;

const EMPTY_PEOPLE_RESPONSE = {
  data: [],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
  success: true,
} satisfies PostgrestResponse<Person>;

const EMPTY_TALK_SUBMISSIONS_RESPONSE = {
  data: [],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
  success: true,
} satisfies PostgrestResponse<OrganizerTalkSubmission>;

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
  let upcomingPublicEventResponse = createEventResponse(DEFAULT_EVENT);
  const isAuthenticated = signal(false);
  const userProfile = signal<{ avatarUrl: string | null; displayName: string } | null>(null);

  beforeEach(async () => {
    upcomingPublicEventResponse = createEventResponse(DEFAULT_EVENT);
    isAuthenticated.set(false);
    userProfile.set(null);
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
            getUpcomingPublicEvent: vi.fn(async () => upcomingPublicEventResponse),
            getPastEvents: vi.fn().mockResolvedValue(EMPTY_EVENTS_RESPONSE),
            getSponsors: vi.fn().mockResolvedValue(EMPTY_SPONSORS_RESPONSE),
            getOrganizers: vi.fn().mockResolvedValue(EMPTY_PEOPLE_RESPONSE),
            getFormerOrganizers: vi.fn().mockResolvedValue(EMPTY_PEOPLE_RESPONSE),
            getOrganizerTalkSubmissions: vi.fn().mockResolvedValue(EMPTY_TALK_SUBMISSIONS_RESPONSE),
            getDashboardEvents: vi.fn().mockResolvedValue(EMPTY_DASHBOARD_EVENTS_RESPONSE),
            getAssignableTalks: vi.fn().mockResolvedValue(EMPTY_ASSIGNABLE_TALKS_RESPONSE),
            getVenueOptions: vi.fn().mockResolvedValue(EMPTY_VENUES_RESPONSE),
            canCurrentUserManageEvents: vi.fn().mockResolvedValue(true),
            createEvent: vi.fn(),
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
            userProfile,
            waitUntilInitialized: vi.fn().mockResolvedValue(undefined),
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
    upcomingPublicEventResponse = createEventResponse({
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

  it('redirects unauthenticated users away from the dashboard route', async () => {
    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(router.url).toBe('/login');
    expect(compiled.textContent).toContain('Organizer access');
  });

  it('renders the dashboard for authenticated users', async () => {
    isAuthenticated.set(true);
    userProfile.set({
      avatarUrl: null,
      displayName: 'Mateusz Halada',
    });

    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/dashboard/talk-submissions');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(router.url).toBe('/dashboard/talk-submissions');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(compiled.textContent).toContain('Talk submissions');
      expect(compiled.textContent).toContain('Events');
      expect(compiled.textContent).toContain('No talk submissions yet.');
    });
  });

  it('redirects authenticated dashboard index visits to talk submissions', async () => {
    isAuthenticated.set(true);
    userProfile.set({
      avatarUrl: null,
      displayName: 'Mateusz Halada',
    });

    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/dashboard');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/dashboard/talk-submissions');
  });

  it('renders the dashboard events view for authenticated users', async () => {
    isAuthenticated.set(true);
    userProfile.set({
      avatarUrl: null,
      displayName: 'Mateusz Halada',
    });

    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/dashboard/events');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(router.url).toBe('/dashboard/events');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(compiled.textContent).toContain('Talk submissions');
      expect(compiled.textContent).toContain('Events');
      expect(compiled.textContent).toContain('Create Event');
      expect(compiled.textContent).toContain('No events yet.');
    });
  });

  it('renders the admin event creation form', async () => {
    isAuthenticated.set(true);
    userProfile.set({
      avatarUrl: null,
      displayName: 'Mateusz Halada',
    });

    const fixture = TestBed.createComponent(App);
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/dashboard/events/create');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(router.url).toBe('/dashboard/events/create');
    expect(compiled.querySelector('h1')?.textContent).toContain('Create event');
    expect(compiled.textContent).toContain('Date');
    expect(compiled.textContent).toContain('Time');
    expect(compiled.textContent).toContain('Venue');
    expect(compiled.textContent).toContain('Meetup URL');
    expect(compiled.textContent).toContain('Talk 1');
    expect(compiled.textContent).toContain('Talk 2');
    expect(compiled.textContent).toContain('Add a third talk');
  });
});

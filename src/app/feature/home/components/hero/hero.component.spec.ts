import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HeroComponent } from './hero.component';
import { Event } from '../../../../core/models/event.interface';
import { Sponsor } from '../../../../core/models/sponsor.interface';

const TEST_EVENT: Event = {
  id: 'event-1',
  title: 'Angular Zürich April 2026',
  slug: 'april-2026',
  feature_graphic: null,
  meetup_url: 'https://www.meetup.com/angularzrh/',
  starts_at: '2099-04-17T18:30:00.000Z',
  venue_id: 'venue-1',
  venue: {
    title: 'Constructor Nexademy',
    street: 'Foerrlibuckstrasse 150',
    city: 'Zurich',
    zip: '8005',
    google_maps_url: 'https://maps.example.com',
  },
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
};

const TEST_SPONSORS: Sponsor[] = [];

describe('HeroComponent', () => {
  let component: HeroComponent;
  let fixture: ComponentFixture<HeroComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HeroComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HeroComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('sponsors', TEST_SPONSORS);
    fixture.componentRef.setInput('event', TEST_EVENT);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('associates the event preview with its visible heading', () => {
    const root = fixture.nativeElement as HTMLElement;
    const preview = root.querySelector<HTMLElement>('.event-preview');
    const title = root.querySelector<HTMLElement>('.event-preview__title');

    expect(title?.id).toBe('next-event-title');
    expect(preview?.getAttribute('aria-labelledby')).toBe(title?.id);
    expect(preview?.classList.contains('event-preview--enter')).toBe(true);
    expect(root.querySelector('.hero-copy')?.classList.contains('hero-copy--enter')).toBe(true);
    expect(
      root.querySelector('.hero-description')?.classList.contains('hero-description--enter'),
    ).toBe(true);
    expect(root.querySelector('.sponsors')?.classList.contains('sponsors--enter')).toBe(true);
  });

  it('renders concise semantic date and venue details', () => {
    const root = fixture.nativeElement as HTMLElement;
    const eventTime = root.querySelector<HTMLTimeElement>('.event-preview__fact-copy');
    const venueLink = root.querySelector<HTMLAnchorElement>('.event-preview__fact a');
    const venueLinkText = venueLink?.textContent?.replace(/\s+/g, ' ').trim();

    expect(eventTime?.getAttribute('datetime')).toBe(TEST_EVENT.starts_at);
    expect(eventTime?.textContent).toContain('17 Apr 2099');
    expect(eventTime?.textContent).toContain('20:30');
    expect(eventTime?.textContent).not.toContain('starts at');
    expect(root.querySelector('.event-preview__venue-title')?.textContent).toContain(
      'Constructor Nexademy',
    );
    expect(venueLinkText).not.toContain('Constructor Nexademy');
    expect(venueLinkText).toContain('Foerrlibuckstrasse 150, 8005 Zurich');
    expect(venueLink?.getAttribute('href')).toBe(TEST_EVENT.venue?.google_maps_url);
    expect(venueLink?.textContent).toContain('opens in a new tab');
    expect(
      venueLink?.querySelector('.event-preview__venue-city .event-preview__external-icon'),
    ).not.toBeNull();
  });

  it('renders a single semantic program list when all talks are visible', () => {
    const root = fixture.nativeElement as HTMLElement;
    const program = root.querySelector<HTMLUListElement>('.event-preview__talks');

    expect(program?.children).toHaveLength(1);
    expect(program?.querySelector('.event-preview__talk')?.tagName).toBe('LI');
    expect(root.querySelector('.event-preview__agenda-label')?.textContent?.trim()).toBe('Program');
  });

  it('offers event registration and details as distinct actions', () => {
    const root = fixture.nativeElement as HTMLElement;
    const actions = root.querySelectorAll<HTMLAnchorElement>('.event-preview__actions a');

    expect(actions).toHaveLength(2);
    expect(actions[0].textContent?.trim()).toBe('View details');
    expect(actions[0].getAttribute('href')).toBe(`/events/${TEST_EVENT.slug}`);
    expect(actions[1].textContent).toContain('Reserve your spot on Meetup');
    expect(actions[1].getAttribute('href')).toBe(TEST_EVENT.meetup_url);
  });

  it('promotes event details to the primary action when registration is unavailable', async () => {
    fixture.componentRef.setInput('event', { ...TEST_EVENT, meetup_url: '' });
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const action = root.querySelector<HTMLAnchorElement>('.event-preview__actions a');

    expect(action?.textContent?.trim()).toBe('View details');
    expect(action?.classList.contains('app-button--secondary')).toBe(false);
  });

  it('shows only the centered hero copy when no upcoming event is published', async () => {
    fixture.componentRef.setInput('event', null);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.event-preview')).toBeNull();
    expect(root.querySelector('.hero-content')?.classList.contains('hero-content--solo')).toBe(
      true,
    );
    expect(root.querySelector('.hero-copy')?.classList.contains('hero-copy--solo')).toBe(true);
  });

  it('waits to show the event preview until the upcoming event has loaded', async () => {
    fixture.componentRef.setInput('event', null);
    fixture.componentRef.setInput('eventLoading', true);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.event-preview')).toBeNull();
    expect(root.querySelector('.hero-content')?.classList.contains('hero-content--solo')).toBe(
      false,
    );
    expect(root.querySelector('.hero-copy')?.classList.contains('hero-copy--solo')).toBe(false);
  });

  it('labels the program as a preview when talks are truncated', async () => {
    const firstTalk = TEST_EVENT.talks[0];
    fixture.componentRef.setInput('event', {
      ...TEST_EVENT,
      talks: [
        firstTalk,
        { ...firstTalk, id: 'talk-2', title: 'Typed Forms' },
        { ...firstTalk, id: 'talk-3', title: 'Modern Routing' },
        { ...firstTalk, id: 'talk-4', title: 'Angular Aria' },
      ],
    });
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelectorAll('.event-preview__talk')).toHaveLength(3);
    expect(root.querySelector('.event-preview__agenda-label')?.textContent?.trim()).toBe(
      'Program preview',
    );
  });
});

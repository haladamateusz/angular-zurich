import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Event } from '../../../../core/models/event.interface';
import { PastEventsComponent } from './past-events.component';

const TEST_EVENT: Event = {
  id: 'event-1',
  slug: 'february-2026',
  title: 'Angular Zurich February 2026',
  feature_graphic: null,
  meetup_url: 'https://www.meetup.com/angularzrh/',
  starts_at: '2026-02-17T17:00:00.000Z',
  venue_id: 'venue-1',
  talks: [
    {
      id: 'talk-1',
      title: 'Building accessible Angular applications',
      description: '',
      slides_url: null,
      event_id: 'event-1',
      presentation_time: 1,
      created_by: 'organizer-1',
      speaker_links: [
        {
          speaker: {
            id: 'speaker-1',
            first_name: 'Ada',
            last_name: 'Lovelace',
            picture_url: null,
            label: null,
            company_name: null,
          },
        },
      ],
    },
  ],
  venue: {
    title: 'Constructor Nexademy',
    street: 'Foerrlibuckstrasse 150',
    city: 'Zurich',
    zip: '8005',
    google_maps_url: 'https://maps.example.com',
  },
};

describe('PastEventsComponent', () => {
  let fixture: ComponentFixture<PastEventsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PastEventsComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(PastEventsComponent);
    fixture.componentRef.setInput('events', [TEST_EVENT]);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders unified metadata without making the venue a nested link', () => {
    const root = fixture.nativeElement as HTMLElement;
    const metadata = root.querySelector<HTMLElement>('.past-event-card__meta');

    expect(metadata?.textContent).toContain('17 Feb 2026');
    expect(metadata?.textContent).toContain('18:00');
    expect(metadata?.textContent).toContain(TEST_EVENT.venue?.title);
    expect(metadata?.querySelector('a')).toBeNull();
    expect(metadata?.querySelectorAll('.event-meta__icon')).toHaveLength(3);
    expect(metadata?.querySelectorAll('.event-meta__value')).toHaveLength(3);
  });

  it('uses one native link for the full event card', () => {
    const root = fixture.nativeElement as HTMLElement;
    const card = root.querySelector<HTMLElement>('article.past-event-card');
    const link = card?.querySelector<HTMLAnchorElement>(':scope > .past-event-card__link');

    expect(link?.getAttribute('href')).toBe('/events/february-2026');
    expect(link?.getAttribute('aria-labelledby')).toBe('past-event-title-event-1');
    expect(link?.querySelector('h3')?.id).toBe('past-event-title-event-1');
    expect(card?.querySelectorAll('a')).toHaveLength(1);
  });

  it('uses an abstract background with the event title overlaid on the graphic', () => {
    const root = fixture.nativeElement as HTMLElement;
    const graphicShell = root.querySelector<HTMLElement>('.past-event-card__graphic-shell');
    const graphic = graphicShell?.querySelector<HTMLImageElement>('.past-event-card__graphic');
    const title = graphicShell?.querySelector<HTMLHeadingElement>('.past-event-card__title');

    expect(graphic?.getAttribute('src')).toBe('/past-talks/Abstract background with logos_1.svg');
    expect(graphic?.getAttribute('alt')).toBe('');
    expect(title?.textContent?.trim()).toBe('February 2026');
  });

  it('renders the event program as ordered talk rows', () => {
    const root = fixture.nativeElement as HTMLElement;
    const program = root.querySelector<HTMLUListElement>('.past-event-card__talks');

    expect(root.querySelector('.past-event-card__program-label')?.textContent?.trim()).toBe(
      'Program',
    );
    expect(program?.children).toHaveLength(1);
    expect(program?.querySelector('.past-event-card__talk')?.tagName).toBe('LI');
    expect(program?.textContent).toContain('Building accessible Angular applications');
    expect(program?.textContent).toContain('Ada Lovelace');
    expect(program?.querySelector('.past-event-card__avatar')?.textContent?.trim()).toBe('AL');
  });

  it('keeps the section inert and hidden until the hero intro completes', () => {
    const section = (fixture.nativeElement as HTMLElement).querySelector('.past-events');

    expect(section?.classList.contains('past-events--reveal')).toBe(false);
    expect(section?.getAttribute('aria-hidden')).toBe('true');
    expect(section?.hasAttribute('inert')).toBe(true);
  });

  it('reveals the section after the hero intro completes', async () => {
    fixture.componentRef.setInput('revealAfterHero', true);
    await fixture.whenStable();

    const section = (fixture.nativeElement as HTMLElement).querySelector('.past-events');

    expect(section?.classList.contains('past-events--reveal')).toBe(true);
    expect(section?.hasAttribute('aria-hidden')).toBe(false);
    expect(section?.hasAttribute('inert')).toBe(false);
  });

  it('waits to render cards until the past events have loaded', async () => {
    fixture.componentRef.setInput('events', []);
    fixture.componentRef.setInput('loading', true);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.past-event-card')).toBeNull();
  });
});

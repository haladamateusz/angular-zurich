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
  talks: [],
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
});

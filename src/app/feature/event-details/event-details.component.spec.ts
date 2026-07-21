import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import type { Event as MeetupEvent } from '../../core/models/event.interface';
import { EventDetailsComponent } from './event-details.component';

const FEATURE_GRAPHIC_URL = 'https://example.com/event-graphic.png';

const TEST_EVENT: MeetupEvent = {
  id: 'event-1',
  slug: 'september-2026',
  title: 'Angular Zurich September 2026',
  feature_graphic: FEATURE_GRAPHIC_URL,
  meetup_url: 'https://www.meetup.com/angularzrh/',
  starts_at: '2099-09-08T18:00:00.000Z',
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

describe('EventDetailsComponent', () => {
  let fixture: ComponentFixture<EventDetailsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventDetailsComponent],
      providers: [
        provideRouter([]),
        {
          provide: SupabaseService,
          useValue: {
            getEventBySlug: vi.fn().mockResolvedValue({ data: TEST_EVENT, error: null }),
          },
        },
      ],
    }).compileComponents();

    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);

    fixture = TestBed.createComponent(EventDetailsComponent);
    fixture.componentRef.setInput('slug', TEST_EVENT.slug);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.event-details__hero-graphic'),
      ).not.toBeNull();
    });
  });

  it('removes the feature graphic placeholder when the image loads', () => {
    const root = fixture.nativeElement as HTMLElement;
    const graphic = root.querySelector<HTMLImageElement>('.event-details__hero-graphic');
    const shell = root.querySelector<HTMLElement>('.event-details__hero-graphic-shell');

    expect(root.querySelector('.event-details__hero-graphic-placeholder')).not.toBeNull();
    expect(shell?.classList.contains('event-details__hero-graphic-shell--pending')).toBe(true);

    graphic?.dispatchEvent(new Event('load'));
    fixture.detectChanges();

    expect(root.querySelector('.event-details__hero-graphic-placeholder')).toBeNull();
    expect(shell?.classList.contains('event-details__hero-graphic-shell--pending')).toBe(false);
    expect(shell?.classList.contains('event-details__hero-graphic-shell--loaded')).toBe(true);
  });

  it('uses readable metadata values without linking the venue', () => {
    const root = fixture.nativeElement as HTMLElement;
    const metadata = root.querySelector<HTMLElement>('.event-details__meta');

    expect(metadata?.textContent).toContain('8 Sept 2099');
    expect(metadata?.textContent).toContain('20:00');
    expect(metadata?.textContent).toContain(TEST_EVENT.venue?.title);
    expect(metadata?.querySelector('a')).toBeNull();
  });
});

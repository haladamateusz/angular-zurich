import { type WritableSignal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { ToastService } from '../../core/toast/toast.service';
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
  talks: [
    {
      id: 'talk-1',
      title: 'Building accessible Angular applications',
      description: 'Practical patterns for inclusive Angular applications.',
      slides_url: null,
      event_id: 'event-1',
      presentation_time: 1,
      created_by: 'organizer-1',
      speaker_links: [],
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

const PAST_EVENT: MeetupEvent = {
  ...TEST_EVENT,
  id: 'past-event-1',
  slug: 'september-2020',
  starts_at: '2020-09-08T18:00:00.000Z',
};

describe('EventDetailsComponent', () => {
  let fixture: ComponentFixture<EventDetailsComponent>;
  const removeEvent = vi.fn();

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EventDetailsComponent],
      providers: [
        provideRouter([]),
        {
          provide: SupabaseService,
          useValue: {
            getEventBySlug: vi.fn().mockImplementation((slug: string) =>
              Promise.resolve({
                data: slug === PAST_EVENT.slug ? PAST_EVENT : TEST_EVENT,
                error: null,
              }),
            ),
            removeEvent,
          },
        },
      ],
    }).compileComponents();

    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    removeEvent.mockReset();

    fixture = TestBed.createComponent(EventDetailsComponent);
    fixture.componentRef.setInput('slug', TEST_EVENT.slug);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(
        (fixture.nativeElement as HTMLElement).querySelector(
          '.event-details__hero-graphic-preloader',
        ),
      ).not.toBeNull();
    });
  });

  it('removes the feature graphic placeholder when the image loads', () => {
    const root = fixture.nativeElement as HTMLElement;
    const graphicPreloader = root.querySelector<HTMLImageElement>(
      '.event-details__hero-graphic-preloader',
    );
    const shell = root.querySelector<HTMLElement>('.event-details__hero-graphic-shell');

    expect(root.querySelector('.event-details__hero-graphic-placeholder')).not.toBeNull();
    expect(shell?.classList.contains('event-details__hero-graphic-shell--pending')).toBe(true);

    graphicPreloader?.dispatchEvent(new Event('load'));
    fixture.detectChanges();

    expect(root.querySelector('.event-details__hero-graphic-placeholder')).toBeNull();
    expect(root.querySelector('.event-details__hero-graphic')).not.toBeNull();
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

  it('hides the Meetup reservation action for a past event', async () => {
    fixture.componentRef.setInput('slug', PAST_EVENT.slug);
    fixture.detectChanges();

    await vi.waitFor(() => {
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('8 Sept 2020');
    });

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.event-details__meetup-button'),
    ).toBeNull();
  });

  it('shows a removal action with a confirmation dialog for dashboard visits', async () => {
    const component = fixture.componentInstance as unknown as {
      showDashboardEventsBackLink: WritableSignal<boolean>;
    };
    component.showDashboardEventsBackLink.set(true);

    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const removeButton = root.querySelector<HTMLButtonElement>('.event-details__remove-button');

    expect(removeButton).not.toBeNull();
    expect(root.querySelector('.event-details__modal')).toBeNull();

    removeButton?.click();
    await fixture.whenStable();

    const dialog = root.querySelector<HTMLElement>('.event-details__modal');
    const cancelButton = dialog?.querySelector<HTMLButtonElement>('button');

    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Its assigned talks will be unassigned');
    expect(document.activeElement).toBe(cancelButton);

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    await fixture.whenStable();

    expect(root.querySelector('.event-details__modal')).toBeNull();
    expect(document.activeElement).toBe(removeButton);
  });

  it('uses trailing icons for dashboard event actions', async () => {
    const component = fixture.componentInstance as unknown as {
      showDashboardEventsBackLink: WritableSignal<boolean>;
    };
    component.showDashboardEventsBackLink.set(true);

    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const editButton = root.querySelector<HTMLElement>('.event-details__edit-link');
    const removeButton = root.querySelector<HTMLElement>('.event-details__remove-button');

    expect(editButton?.firstElementChild?.textContent).toBe('Edit');
    expect(editButton?.lastElementChild?.matches('svg.app-button__icon')).toBe(true);
    expect(removeButton?.firstElementChild?.textContent).toBe('Remove event');
    expect(removeButton?.lastElementChild?.matches('svg.app-button__icon')).toBe(true);
  });

  it('removes the current event after confirmation', async () => {
    const component = fixture.componentInstance as unknown as {
      showDashboardEventsBackLink: WritableSignal<boolean>;
    };
    component.showDashboardEventsBackLink.set(true);
    removeEvent.mockResolvedValue({ data: { id: TEST_EVENT.id }, error: null });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.event-details__remove-button')?.click();
    await fixture.whenStable();

    root.querySelector<HTMLButtonElement>('.event-details__modal .app-button--danger')?.click();
    await fixture.whenStable();

    expect(removeEvent).toHaveBeenCalledWith(TEST_EVENT.id);
    expect(TestBed.inject(ToastService).toasts()).toContainEqual(
      expect.objectContaining({ message: 'Event removed.', variant: 'success' }),
    );
    expect(navigate).toHaveBeenCalledWith(['/dashboard/events']);
  });
});

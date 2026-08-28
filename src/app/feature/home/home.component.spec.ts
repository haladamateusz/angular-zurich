import { PLATFORM_ID, TransferState } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import type { Event } from '../../core/models/event.interface';
import { Person } from '../../core/models/person.interface';
import { Sponsor } from '../../core/models/sponsor.interface';
import { HOME_STATE_KEYS } from './data-access/home-state.keys';
import { HomeComponent } from './home.component';

const UPCOMING_EVENT: Event = {
  id: 'event-1',
  slug: 'angular-zurich-meetup',
  title: 'Angular Zürich Meetup',
  feature_graphic: null,
  meetup_url: 'https://meetup.com/angularzrh',
  starts_at: '2099-01-01T18:00:00.000Z',
  venue_id: 'venue-1',
  talks: [],
  venue: null,
};

const PAST_EVENTS: Event[] = [];
const SPONSORS: Sponsor[] = [];
const ORGANIZERS: Person[] = [];
const FORMER_ORGANIZERS: Person[] = [];

describe('HomeComponent', () => {
  it('reveals past events only after the hero intro completion event', async () => {
    const transferState = new TransferState();
    transferState.set(HOME_STATE_KEYS.upcomingPublicEvent, UPCOMING_EVENT);
    transferState.set(HOME_STATE_KEYS.sponsors, SPONSORS);
    transferState.set(HOME_STATE_KEYS.pastEvents, [UPCOMING_EVENT]);
    transferState.set(HOME_STATE_KEYS.stats, { talks: 248, speakers: 193, events: 81 });
    transferState.set(HOME_STATE_KEYS.organizers, ORGANIZERS);
    transferState.set(HOME_STATE_KEYS.formerOrganizers, FORMER_ORGANIZERS);

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: SupabaseService,
          useValue: {
            getUpcomingPublicEvent: vi.fn(),
            getSponsors: vi.fn(),
            getPastEvents: vi.fn(),
            getStatsCounts: vi.fn(),
            getOrganizers: vi.fn(),
            getFormerOrganizers: vi.fn(),
          },
        },
        { provide: TransferState, useValue: transferState },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<HomeComponent> = TestBed.createComponent(HomeComponent);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;
    const pastEvents = root.querySelector<HTMLElement>('.past-events');

    expect(pastEvents?.getAttribute('aria-hidden')).toBe('true');
    expect(pastEvents?.hasAttribute('inert')).toBe(true);

    const completionEvent = new Event('animationend');
    Object.defineProperty(completionEvent, 'animationName', { value: 'event-preview-enter' });
    root.querySelector<HTMLElement>('.event-preview')?.dispatchEvent(completionEvent);
    await fixture.whenStable();

    expect(pastEvents?.hasAttribute('aria-hidden')).toBe(false);
    expect(pastEvents?.hasAttribute('inert')).toBe(false);
  });

  it('reuses every transferred home response without calling Supabase in the browser', async () => {
    const transferState = new TransferState();
    transferState.set(HOME_STATE_KEYS.upcomingPublicEvent, UPCOMING_EVENT);
    transferState.set(HOME_STATE_KEYS.sponsors, SPONSORS);
    transferState.set(HOME_STATE_KEYS.pastEvents, PAST_EVENTS);
    transferState.set(HOME_STATE_KEYS.stats, { talks: 248, speakers: 193, events: 81 });
    transferState.set(HOME_STATE_KEYS.organizers, ORGANIZERS);
    transferState.set(HOME_STATE_KEYS.formerOrganizers, FORMER_ORGANIZERS);

    const supabaseServiceMock = {
      getUpcomingPublicEvent: vi.fn(),
      getSponsors: vi.fn(),
      getPastEvents: vi.fn(),
      getStatsCounts: vi.fn(),
      getOrganizers: vi.fn(),
      getFormerOrganizers: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: SupabaseService, useValue: supabaseServiceMock },
        { provide: TransferState, useValue: transferState },
      ],
    }).compileComponents();

    const fixture: ComponentFixture<HomeComponent> = TestBed.createComponent(HomeComponent);
    await fixture.whenStable();

    expect(supabaseServiceMock.getUpcomingPublicEvent).not.toHaveBeenCalled();
    expect(supabaseServiceMock.getSponsors).not.toHaveBeenCalled();
    expect(supabaseServiceMock.getPastEvents).not.toHaveBeenCalled();
    expect(supabaseServiceMock.getStatsCounts).not.toHaveBeenCalled();
    expect(supabaseServiceMock.getOrganizers).not.toHaveBeenCalled();
    expect(supabaseServiceMock.getFormerOrganizers).not.toHaveBeenCalled();
    expect(transferState.hasKey(HOME_STATE_KEYS.upcomingPublicEvent)).toBe(false);
    expect(transferState.hasKey(HOME_STATE_KEYS.sponsors)).toBe(false);
    expect(transferState.hasKey(HOME_STATE_KEYS.pastEvents)).toBe(false);
    expect(transferState.hasKey(HOME_STATE_KEYS.stats)).toBe(false);
    expect(transferState.hasKey(HOME_STATE_KEYS.organizers)).toBe(false);
    expect(transferState.hasKey(HOME_STATE_KEYS.formerOrganizers)).toBe(false);
  });
});

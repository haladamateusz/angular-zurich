import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PostgrestResponse } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { Event } from '../../core/models/event.interface';
import { PastEventsPageComponent } from './past-events-page.component';

const PAST_EVENT: Event = {
  id: 'event-1',
  slug: 'february-2026',
  title: 'Angular Zürich February 2026',
  feature_graphic: null,
  meetup_url: 'https://www.meetup.com/angularzrh/',
  starts_at: '2026-02-17T17:00:00.000Z',
  venue_id: 'venue-1',
  talks: [],
  venue: null,
};

const PAST_EVENTS_RESPONSE = {
  data: [PAST_EVENT],
  error: null,
  count: null,
  status: 200,
  statusText: 'OK',
  success: true,
} satisfies PostgrestResponse<Event>;

describe('PastEventsPageComponent', () => {
  it('shows the complete curated archive without a second browse action', async () => {
    const getPastEvents = vi.fn().mockResolvedValue(PAST_EVENTS_RESPONSE);

    await TestBed.configureTestingModule({
      imports: [PastEventsPageComponent],
      providers: [provideRouter([]), { provide: SupabaseService, useValue: { getPastEvents } }],
    }).compileComponents();

    const fixture: ComponentFixture<PastEventsPageComponent> =
      TestBed.createComponent(PastEventsPageComponent);
    await fixture.whenStable();

    const root = fixture.nativeElement as HTMLElement;

    expect(getPastEvents).toHaveBeenCalledWith();
    expect(root.querySelector('h1')?.textContent?.trim()).toBe('Past events');
    expect(root.querySelector('.past-events-page__scope')).toBeNull();
    expect(root.querySelectorAll('.past-event-card')).toHaveLength(1);
    expect(root.querySelector('.past-events__browse-button')).toBeNull();
  });
});

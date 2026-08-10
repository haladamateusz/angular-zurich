import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { CreateEventComponent } from './create-event.component';

const assignableTalks = [
  {
    id: 'talk-1',
    source_talk_submission_id: 'submission-1',
    title: 'Signals at scale',
    speaker_links: [],
  },
  {
    id: 'talk-2',
    source_talk_submission_id: 'submission-2',
    title: 'Angular performance',
    speaker_links: [],
  },
  {
    id: 'talk-3',
    source_talk_submission_id: 'submission-3',
    title: 'Typed routing',
    speaker_links: [],
  },
];

const venueOptions = [
  {
    id: 'venue-1',
    title: 'Google Zurich',
    street: 'Europaallee 22',
    zip: '8004',
    city: 'Zurich',
  },
];
let eventId: string | null = null;

describe('CreateEventComponent', () => {
  beforeEach(() => {
    eventId = null;

    TestBed.configureTestingModule({
      imports: [CreateEventComponent],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (name: string) => (name === 'eventId' ? eventId : null),
              },
            },
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            getAssignableTalks: vi.fn().mockResolvedValue({
              data: assignableTalks,
              error: null,
            }),
            getVenueOptions: vi.fn().mockResolvedValue({
              data: venueOptions,
              error: null,
            }),
            createEvent: vi.fn(),
            getEventForEdit: vi.fn().mockResolvedValue({ data: null, error: null }),
          },
        },
      ],
    });
  });

  it('does not show a removal action while editing an event', async () => {
    eventId = 'event-1';
    const fixture = TestBed.createComponent(CreateEventComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const removeEventButton = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Remove Event',
    );

    expect(element.querySelector('h1')?.textContent).toContain('Edit event');
    expect(removeEventButton).toBeUndefined();
  });

  it('adds and removes an optional third talk selector', async () => {
    const fixture = TestBed.createComponent(CreateEventComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const getTalkSelectors = (): NodeListOf<HTMLButtonElement> =>
      element.querySelectorAll('button[id^="eventTalk"]');
    const addThirdTalkButton = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Add a third talk'),
    );

    expect(getTalkSelectors()).toHaveLength(2);
    expect(addThirdTalkButton).toBeDefined();

    addThirdTalkButton?.click();
    await fixture.whenStable();

    expect(getTalkSelectors()).toHaveLength(3);

    const removeThirdTalkButton = element.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove third talk"]',
    );

    expect(removeThirdTalkButton).not.toBeNull();

    removeThirdTalkButton?.click();
    await fixture.whenStable();

    expect(getTalkSelectors()).toHaveLength(2);
  });

  it('shows the insufficient talks notice only after a create attempt', async () => {
    const supabaseService = TestBed.inject(SupabaseService);

    vi.mocked(supabaseService.getAssignableTalks).mockResolvedValue({
      data: [],
      error: null,
      success: true,
      count: null,
      status: 200,
      statusText: 'OK',
    });

    const fixture = TestBed.createComponent(CreateEventComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const noticeText = 'At least two approved, unassigned talks are required to create an event.';
    const form = element.querySelector<HTMLFormElement>('form');
    const submitButton = element.querySelector<HTMLButtonElement>('.create-event-form__submit');

    expect(element.textContent).not.toContain(noticeText);
    expect(submitButton?.disabled).toBe(true);

    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.textContent).toContain(noticeText);
  });

  it('closes the date picker popup when scrolling starts', async () => {
    const fixture = TestBed.createComponent(CreateEventComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const dateTrigger = element.querySelector<HTMLButtonElement>('#eventStartsDate');
    dateTrigger?.click();
    await fixture.whenStable();

    expect(dateTrigger?.getAttribute('aria-expanded')).toBe('true');

    document.dispatchEvent(new WheelEvent('wheel'));
    await fixture.whenStable();

    expect(dateTrigger?.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens selects below their trigger, rotates the chevron, and closes on scroll', async () => {
    const fixture = TestBed.createComponent(CreateEventComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const venueTrigger = element.querySelector<HTMLButtonElement>('#eventVenue');

    venueTrigger?.click();
    await fixture.whenStable();

    const listbox = element.querySelector<HTMLElement>('#eventVenue-listbox');
    const chevron = venueTrigger?.querySelector('svg');

    expect(venueTrigger?.getAttribute('aria-expanded')).toBe('true');
    expect(listbox).not.toBeNull();
    expect(chevron?.classList.contains('app-select-chevron--open')).toBe(true);

    listbox?.querySelector<HTMLButtonElement>('[role="option"]')?.click();
    await fixture.whenStable();

    expect(venueTrigger?.textContent).toContain('Google Zurich');

    venueTrigger?.click();
    await fixture.whenStable();

    document.dispatchEvent(new WheelEvent('wheel'));
    await fixture.whenStable();

    expect(venueTrigger?.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('#eventVenue-listbox')).toBeNull();
  });

  it('keeps selects open when scrolling inside their listbox', async () => {
    const fixture = TestBed.createComponent(CreateEventComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const venueTrigger = element.querySelector<HTMLButtonElement>('#eventVenue');

    venueTrigger?.click();
    await fixture.whenStable();

    const listbox = element.querySelector<HTMLElement>('#eventVenue-listbox');

    listbox?.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    await fixture.whenStable();

    expect(venueTrigger?.getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('#eventVenue-listbox')).not.toBeNull();
  });

  it('lets organizers choose whether an event is public or a draft', async () => {
    const fixture = TestBed.createComponent(CreateEventComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const visibilityOptions = element.querySelectorAll<HTMLInputElement>(
      'input[name="eventVisibility"]',
    );
    const publicOption = visibilityOptions.item(0);
    const draftOption = visibilityOptions.item(1);

    expect(publicOption.checked).toBe(true);
    expect(draftOption.checked).toBe(false);

    draftOption.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(publicOption.checked).toBe(false);
    expect(draftOption.checked).toBe(true);
  });
});

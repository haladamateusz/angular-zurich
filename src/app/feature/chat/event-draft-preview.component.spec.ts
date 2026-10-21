import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { EventDraftPreviewComponent } from './event-draft-preview.component';
import { EventDraftService } from './data-access/event-draft.service';
import { EventDraft } from '../../core/models/event-draft.model';
import { CreateEventDatePickerComponent } from '../../ui/event-fields/create-event-date-picker.component';

function createDraft(): EventDraft {
  return {
    id: crypto.randomUUID(),
    created_by: crypto.randomUUID(),
    thread_id: crypto.randomUUID(),
    version: 1,
    state: 'draft',
    event_id: null,
    event_slug: null,
    created_at: '',
    updated_at: '',
    content: {
      title: 'Angular Zürich',
      description: '',
      startsAt: '2026-11-18T18:15',
      venueId: '',
      meetupUrl: '',
      imageUrl: '',
      talks: [],
    },
  };
}

describe('EventDraftPreviewComponent fields', () => {
  it('saves date, time and venue selections and attaches the selected talk', async () => {
    const venueId = crypto.randomUUID();
    const talkId = crypto.randomUUID();
    const draft = createDraft();
    const change = vi.fn(async (current: EventDraft, action: string) => {
      if (action === 'attach')
        return {
          ...current,
          version: current.version + 1,
          content: {
            ...current.content,
            talks: [
              ...current.content.talks,
              {
                id: talkId,
                title: 'Angular signals',
                description: '',
                speakerIds: [],
                sourceTalkId: talkId,
              },
            ],
          },
        };
      return current;
    });
    TestBed.configureTestingModule({
      imports: [EventDraftPreviewComponent],
      providers: [
        provideRouter([]),
        {
          provide: EventDraftService,
          useValue: {
            load: vi.fn(async () => ({ draft, audit: [] })),
            options: vi.fn(async () => ({
              venues: [
                { id: venueId, title: 'Community hall', street: 'Main Street', city: 'Zürich' },
              ],
              speakers: [],
              talks: [
                {
                  id: talkId,
                  title: 'Angular signals',
                  speakerNames: ['Tomas Trajan', 'Alex Morgan'],
                },
              ],
            })),
            change,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(EventDraftPreviewComponent);
    fixture.componentRef.setInput('draftId', draft.id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    await expect
      .poll(() => {
        fixture.detectChanges();
        return root.textContent;
      })
      .toContain('Angular Zürich');
    const date = fixture.debugElement.query(By.directive(CreateEventDatePickerComponent))
      .componentInstance as CreateEventDatePickerComponent;
    expect(date.value()).toBe('2026-11-18');
    const time = root.querySelector<HTMLButtonElement>('[role="combobox"]')!;
    const venue = root.querySelector<HTMLButtonElement>('[id^="draft-venue-"]')!;
    const talk = root.querySelector<HTMLButtonElement>('[id^="draft-talk-"]')!;
    await expect
      .poll(() => {
        fixture.detectChanges();
        return venue.disabled;
      })
      .toBe(false);
    expect(time.textContent).toContain('18:15');
    const save = root.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(save.disabled).toBe(true);
    venue.click();
    await fixture.whenStable();
    const venueOption = [...root.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (button) => button.textContent?.includes('Community hall'),
    )!;
    venueOption.click();
    await fixture.whenStable();
    expect(venue.textContent).toContain('Community hall');
    expect(talk.disabled).toBe(true);
    date.value.set('2026-11-25');
    await fixture.whenStable();
    expect(save.disabled).toBe(false);
    time.click();
    await fixture.whenStable();
    const option = [...root.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (button) => button.textContent?.trim() === '19:00',
    )!;
    option.click();
    await fixture.whenStable();
    save.click();
    await fixture.whenStable();
    expect(change).toHaveBeenCalledWith(draft, 'update', {
      fields: {
        title: draft.content.title,
        description: '',
        venueId,
        meetupUrl: '',
        imageUrl: '',
        startsAt: '2026-11-25T19:00',
      },
    });
    await expect
      .poll(() => {
        fixture.detectChanges();
        return talk.disabled;
      })
      .toBe(false);
    talk.click();
    await fixture.whenStable();
    const talkOption = [...root.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(
      (button) => button.textContent?.trim() === 'Angular signals - Tomas Trajan, Alex Morgan',
    )!;
    talkOption.click();
    await fixture.whenStable();
    expect(change).toHaveBeenCalledWith(draft, 'attach', { talkId });
    await expect
      .poll(() => {
        fixture.detectChanges();
        return talk.textContent;
      })
      .toContain('Angular signals - Tomas Trajan, Alex Morgan');
    const talkSelects = () => root.querySelectorAll('[role="combobox"][id^="draft-talk-"]');
    expect(talkSelects()).toHaveLength(2);
    const addThird = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === 'Add a third talk',
    )!;
    await expect
      .poll(() => {
        fixture.detectChanges();
        return addThird.disabled;
      })
      .toBe(false);
    addThird.click();
    await fixture.whenStable();
    expect(talkSelects()).toHaveLength(3);
    expect(root.textContent).not.toContain('Add a third talk');
    const third = talkSelects()[2] as HTMLButtonElement;
    third.click();
    await fixture.whenStable();
    const duplicate = [...root.querySelectorAll('[role="option"]')].find(
      (option) => option.textContent?.trim() === 'Angular signals - Tomas Trajan, Alex Morgan',
    )!;
    expect(duplicate.getAttribute('aria-disabled')).toBe('true');
    root.querySelector<HTMLButtonElement>('[aria-label="Remove third talk"]')!.click();
    await fixture.whenStable();
    expect(talkSelects()).toHaveLength(2);
    expect(root.textContent).toContain('Add a third talk');
  });
  it('refreshes chat edits while keeping local edits and queues overlapping refreshes', async () => {
    const original = createDraft();
    const updated = {
      ...original,
      version: 2,
      content: {
        ...original.content,
        meetupUrl: 'https://www.meetup.com/angularzrh/events/placeholder/',
        talks: [
          {
            id: crypto.randomUUID(),
            title: 'Chat selected talk',
            description: 'A talk',
            speakerIds: [crypto.randomUUID()],
            sourceTalkId: null,
          },
        ],
      },
    };
    const latest = {
      ...updated,
      version: 3,
      content: { ...updated.content, startsAt: '2026-11-25T18:30' },
    };
    let resolveRefresh!: (value: { draft: EventDraft; audit: [] }) => void;
    const load = vi
      .fn()
      .mockResolvedValueOnce({ draft: original, audit: [] })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveRefresh = resolve;
          }),
      )
      .mockResolvedValue({ draft: latest, audit: [] });
    TestBed.configureTestingModule({
      imports: [EventDraftPreviewComponent],
      providers: [
        provideRouter([]),
        {
          provide: EventDraftService,
          useValue: {
            load,
            options: vi.fn(async () => ({ venues: [], speakers: [], talks: [] })),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(EventDraftPreviewComponent);
    fixture.componentRef.setInput('draftId', original.id);
    const root: HTMLElement = fixture.nativeElement;
    await expect
      .poll(() => {
        fixture.detectChanges();
        return root.querySelector('fieldset')?.disabled;
      })
      .toBe(false);
    const title = root.querySelector<HTMLInputElement>('input[formcontrolname="title"]')!;
    title.value = 'Local unsaved title';
    title.dispatchEvent(new Event('input'));
    fixture.componentRef.setInput('refreshVersion', 2);
    fixture.detectChanges();
    await expect.poll(() => load.mock.calls.length).toBe(2);
    fixture.componentRef.setInput('refreshVersion', 3);
    fixture.detectChanges();
    resolveRefresh({ draft: updated, audit: [] });
    await expect
      .poll(() => {
        fixture.detectChanges();
        return load.mock.calls.length;
      })
      .toBe(3);
    await expect
      .poll(() => {
        fixture.detectChanges();
        return root.querySelector<HTMLInputElement>('input[formcontrolname="meetupUrl"]')?.value;
      })
      .toBe(updated.content.meetupUrl);
    expect(title.value).toBe('Local unsaved title');
    expect(root.textContent).toContain('Chat selected talk');
    expect(root.querySelector<HTMLButtonElement>('[id^="draft-time-"]')?.textContent).toContain(
      '18:30',
    );
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });
});

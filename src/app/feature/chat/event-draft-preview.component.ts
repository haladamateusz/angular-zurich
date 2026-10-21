import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  ElementRef,
  viewChild,
  afterRenderEffect,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { CreateEventDatePickerComponent } from '../../ui/event-fields/create-event-date-picker.component';
import { CreateEventSelectComponent } from '../../ui/event-fields/create-event-select.component';
import { EVENT_TIME_OPTIONS } from '../../ui/event-fields/event-time-options';
import { EventDraftService } from './data-access/event-draft.service';
import {
  EventDraft,
  EventDraftOptions,
  EventDraftReview,
  eventDraftFieldsSchema,
} from '../../core/models/event-draft.model';

@Component({
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CreateEventDatePickerComponent,
    CreateEventSelectComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-event-draft-preview',
  styleUrl: './event-draft-preview.component.css',
  templateUrl: './event-draft-preview.component.html',
})
export class EventDraftPreviewComponent {
  private readonly reviewHeading = viewChild<ElementRef<HTMLElement>>('reviewHeading');
  readonly draftId = input<string | null>(null);
  readonly refreshVersion = input(0);
  readonly previewReady = output<void>();
  private readonly api = inject(EventDraftService);
  protected readonly draft = signal<EventDraft | null>(null);
  protected readonly options = signal<EventDraftOptions>({ venues: [], speakers: [], talks: [] });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly discardConfirm = signal(false);
  protected readonly review = signal<EventDraftReview | null>(null);
  private pendingRefresh: string | null = null;
  protected readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    startsAt: new FormControl('', { nonNullable: true }),
    venueId: new FormControl('', { nonNullable: true }),
    meetupUrl: new FormControl('', { nonNullable: true }),
    imageUrl: new FormControl('', { nonNullable: true }),
  });
  private readonly startsAt = toSignal(this.form.controls.startsAt.valueChanges, {
    initialValue: '',
  });
  protected readonly startsDate = computed(() => this.startsAt().split('T')[0]);
  protected readonly startsTime = computed(() => this.startsAt().split('T')[1]?.slice(0, 5) ?? '');
  protected readonly timeSelectOptions = computed(() => {
    const time = this.startsTime();
    return time && !EVENT_TIME_OPTIONS.some((option) => option.value === time)
      ? [...EVENT_TIME_OPTIONS, { value: time, label: time }].sort((a, b) =>
          a.value.localeCompare(b.value),
        )
      : EVENT_TIME_OPTIONS;
  });
  protected updateDateTime(date: string, time: string) {
    if (this.busy()) return;
    this.form.controls.startsAt.setValue(`${date}T${time}`);
    this.form.controls.startsAt.markAsDirty();
    this.form.controls.startsAt.markAsTouched();
  }
  protected readonly venueId = toSignal(this.form.controls.venueId.valueChanges, {
    initialValue: '',
  });
  protected readonly venueSelectOptions = computed(() => [
    { value: '', label: 'Choose a venue' },
    ...this.options().venues.map((venue) => ({
      value: venue.id,
      label: `${venue.title} — ${venue.street}, ${venue.city}`,
    })),
  ]);
  protected readonly talkSlots = signal<string[]>(['', '']);
  protected talkSelectOptions(index: number) {
    const talks = new Map(
      this.options().talks.map((talk) => [
        talk.id,
        `${talk.title} - ${talk.speakerNames?.join(', ') || 'Speaker unavailable'}`,
      ]),
    );
    for (const talk of this.draft()?.content.talks ?? []) {
      const names = this.speakerNames(talk.speakerIds);
      if (names || !talks.has(talk.id))
        talks.set(talk.id, `${talk.title} - ${names || 'Speaker unavailable'}`);
    }
    return [
      { value: '', label: 'Select an approved talk' },
      ...Array.from(talks, ([value, label]) => ({
        value,
        label,
        disabled: this.talkSlots().some((id, slot) => slot !== index && id === value),
      })),
    ];
  }
  protected addThirdTalk() {
    if (!this.busy() && this.talkSlots().length === 2) {
      this.talkSlots.update((slots) => [...slots, '']);
    }
  }
  protected async removeThirdTalk() {
    await this.selectTalk(2, '');
    if (!this.busy() && !this.talkSlots()[2]) {
      this.talkSlots.update((slots) => slots.slice(0, 2));
    }
  }
  protected async selectTalk(index: number, talkId: string) {
    const draft = this.draft();
    const previousId = this.talkSlots()[index];
    if (!draft || this.busy() || this.form.dirty || previousId === talkId) return;
    if (talkId && this.talkSlots().includes(talkId)) return;
    await this.work(async () => {
      let saved = draft;
      try {
        if (previousId) saved = await this.api.change(saved, 'remove-talk', { talkId: previousId });
        if (talkId) saved = await this.api.change(saved, 'attach', { talkId });
        this.talkSlots.update((slots) => slots.map((id, slot) => (slot === index ? talkId : id)));
      } finally {
        this.setDraft(saved);
      }
      this.notice.set('Draft saved privately.');
    });
  }
  protected updateSelection(control: FormControl<string>, value: string) {
    if (this.busy()) return;
    control.setValue(value);
    control.markAsDirty();
    control.markAsTouched();
  }
  constructor() {
    afterRenderEffect(() => {
      if (this.draft()) this.previewReady.emit();
    });
    afterRenderEffect(() => {
      const heading = this.reviewHeading();
      if (this.review() && heading) heading.nativeElement.focus();
    });
    effect(() => {
      const id = this.draftId();
      this.refreshVersion();
      if (id) untracked(() => void this.load(id));
    });
  }
  private async work(task: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      await task();
    } catch (error) {
      this.review.set(null);
      this.error.set(
        error instanceof Error ? error.message : 'The draft request failed. Try again.',
      );
    } finally {
      this.busy.set(false);
      const pending = this.pendingRefresh;
      this.pendingRefresh = null;
      if (pending) void this.load(pending);
    }
  }
  private setDraft(draft: EventDraft, preserveEdits = false) {
    const edits =
      preserveEdits && this.draft()?.id === draft.id
        ? Object.entries(this.form.controls)
            .filter(([, control]) => control.dirty)
            .map(([, control]) => ({ control, value: control.value }))
        : [];
    const sameDraft = this.draft()?.id === draft.id;
    const remaining = new Set(draft.content.talks.map((talk) => talk.id));
    const slots = sameDraft
      ? this.talkSlots().map((id) => {
          if (remaining.delete(id)) return id;
          return '';
        })
      : ['', ''];
    for (const id of remaining) {
      const empty = slots.indexOf('');
      if (empty >= 0) slots[empty] = id;
      else slots.push(id);
    }
    this.talkSlots.set(slots);
    this.draft.set(draft);
    this.form.reset(draft.content);
    for (const { control, value } of edits) {
      if (control.value !== value) {
        control.setValue(value);
        control.markAsDirty();
      }
    }
    if (this.form.dirty) this.notice.set('Draft refreshed. Your unsaved edits are kept.');
    this.review.set(null);
    this.discardConfirm.set(false);
  }
  protected async load(id: string) {
    if (this.busy()) {
      this.pendingRefresh = id;
      return;
    }
    await this.work(async () => {
      const [loaded, options] = await Promise.all([this.api.load(id), this.api.options()]);
      this.setDraft(loaded.draft, true);
      this.options.set(options);
    });
  }
  private async change(action: string, data: Record<string, unknown> = {}) {
    const draft = this.draft();
    if (!draft) return;
    await this.work(async () => {
      this.setDraft(await this.api.change(draft, action, data));
      this.notice.set('Draft saved privately.');
    });
  }
  protected async save() {
    const parsed = eventDraftFieldsSchema.safeParse(this.form.getRawValue());
    if (!parsed.success) {
      this.error.set('Check the title, date, venue and HTTPS links.');
      return;
    }
    await this.change('update', { fields: parsed.data });
  }
  protected async discard() {
    await this.change('discard');
  }
  protected async prepare() {
    const draft = this.draft();
    if (!draft || this.form.dirty) return;
    await this.work(async () => {
      this.review.set(await this.api.review(draft));
    });
  }
  protected cancelReview() {
    this.review.set(null);
  }
  protected async saveEvent() {
    const approval = this.review();
    if (!approval?.token || approval.saveIssues.length) return;
    const token = approval.token;
    await this.work(async () => {
      try {
        this.setDraft(await this.api.saveEvent(approval.draft, token));
      } catch (error) {
        const latest = await this.api.load(approval.draft.id).catch(() => null);
        if (latest && latest.draft.version !== approval.draft.version) {
          this.setDraft(latest.draft);
          throw new Error('The draft changed. Review the latest version before saving.', {
            cause: error,
          });
        }
        throw error;
      }
      this.notice.set('Event saved with Draft visibility.');
    });
  }
  protected venueName(id: string) {
    const venue = this.options().venues.find((item) => item.id === id);
    return venue ? `${venue.title}, ${venue.street}, ${venue.city}` : id;
  }
  protected speakerNames(ids: string[]) {
    return ids
      .map((id) => {
        const speaker = this.options().speakers.find((item) => item.id === id);
        return speaker ? `${speaker.first_name ?? ''} ${speaker.last_name ?? ''}`.trim() : '';
      })
      .filter((name) => name.length > 0)
      .join(', ');
  }
}

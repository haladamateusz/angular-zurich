import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  ElementRef,
  viewChild,
  afterRenderEffect,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { EventDraftService } from './data-access/event-draft.service';
import {
  EventDraft,
  EventDraftAudit,
  EventDraftOptions,
  eventDraftFieldsSchema,
} from '../../core/models/event-draft.model';

@Component({
  imports: [ReactiveFormsModule, RouterLink, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-event-draft-preview',
  styleUrl: './event-draft-preview.component.css',
  templateUrl: './event-draft-preview.component.html',
})
export class EventDraftPreviewComponent {
  private readonly reviewHeading = viewChild<ElementRef<HTMLElement>>('reviewHeading');
  readonly draftId = input<string | null>(null);
  readonly refreshVersion = input(0);
  private readonly api = inject(EventDraftService);
  protected readonly draft = signal<EventDraft | null>(null);
  protected readonly audit = signal<EventDraftAudit[]>([]);
  protected readonly options = signal<EventDraftOptions>({ venues: [], speakers: [], talks: [] });
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly discardConfirm = signal(false);
  protected readonly review = signal<{ draft: EventDraft; token: string } | null>(null);
  protected readonly form = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    startsAt: new FormControl('', { nonNullable: true }),
    venueId: new FormControl('', { nonNullable: true }),
    meetupUrl: new FormControl('', { nonNullable: true }),
    imageUrl: new FormControl('', { nonNullable: true }),
  });
  protected readonly talkForm = new FormGroup({
    title: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    speakerIds: new FormControl<string[]>([], { nonNullable: true }),
  });
  protected readonly existingTalk = new FormControl('', { nonNullable: true });
  protected readonly availableTalks = computed(() =>
    this.options().talks.filter(
      (talk) => !this.draft()?.content.talks.some((selected) => selected.id === talk.id),
    ),
  );
  constructor() {
    afterRenderEffect(() => {
      const heading = this.reviewHeading();
      if (this.review() && heading) heading.nativeElement.focus();
    });
    effect(() => {
      const id = this.draftId();
      this.refreshVersion();
      if (id)
        untracked(() => {
          if (this.form.dirty)
            this.error.set(
              'A newer draft is available. Save your edits or reload the latest version.',
            );
          else void this.load(id);
        });
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
    }
  }
  private setDraft(draft: EventDraft) {
    this.draft.set(draft);
    this.form.reset(draft.content);
    this.review.set(null);
    this.discardConfirm.set(false);
  }
  protected async load(id: string) {
    await this.work(async () => {
      const [loaded, options] = await Promise.all([this.api.load(id), this.api.options()]);
      this.setDraft(loaded.draft);
      this.audit.set(loaded.audit);
      this.options.set(options);
    });
  }
  private async change(action: string, data: Record<string, unknown> = {}) {
    const draft = this.draft();
    if (!draft) return;
    await this.work(async () => {
      this.setDraft(await this.api.change(draft, action, data));
      this.audit.set((await this.api.load(draft.id)).audit);
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
  protected async attach() {
    await this.change('attach', { talkId: this.existingTalk.value });
    this.existingTalk.reset();
  }
  protected async remove(talkId: string) {
    await this.change('remove-talk', { talkId });
  }
  protected async addTalk() {
    await this.change('create-talk', this.talkForm.getRawValue());
    if (!this.error()) this.talkForm.reset();
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
  protected async publish() {
    const approval = this.review();
    if (!approval) return;
    await this.work(async () => {
      this.setDraft(await this.api.publish(approval.draft, approval.token));
      this.audit.set((await this.api.load(approval.draft.id)).audit);
      this.notice.set('Event published.');
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
        return speaker ? `${speaker.first_name ?? ''} ${speaker.last_name ?? ''}`.trim() : id;
      })
      .join(', ');
  }
}

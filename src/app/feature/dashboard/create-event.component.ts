import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  FormField,
  applyEach,
  form,
  maxLength,
  minLength,
  pattern,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import {
  AssignableTalk,
  CreateEventPayload,
  UpdateEventPayload,
  VenueOption,
} from '../../core/models/event-management.interface';
import { Event as ZurichEvent } from '../../core/models/event.interface';
import { CreateEventDatePickerComponent } from './create-event-date-picker.component';
import {
  CreateEventSelectComponent,
  CreateEventSelectOption,
} from './create-event-select.component';

type CreateEventState = 'idle' | 'submitting';
type OptionsState = 'loading' | 'ready' | 'error';

interface CreateEventFormModel {
  title: string;
  startsDate: string;
  startsTime: string;
  meetupUrl: string;
  venueId: string;
  talks: { talkId: string }[];
  isPublic: boolean;
}

const HTTP_URL_PATTERN = /^https?:\/\/\S+$/i;
const EVENT_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const EVENT_IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const EVENT_TIME_OPTIONS = Array.from({ length: 25 }, (_, index) => {
  const totalMinutes = 8 * 60 + index * 30;
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  const time = `${hours}:${minutes}`;

  return { value: time, label: time };
}) satisfies readonly CreateEventSelectOption[];
const EVENT_TIME_VALUES = new Set(EVENT_TIME_OPTIONS.map((option) => option.value));

function parseLocalEventDateTime(date: string, time: string): Date | null {
  if (!date || !time) {
    return null;
  }

  const startsAt = new Date(`${date}T${time}`);

  return Number.isNaN(startsAt.getTime()) ? null : startsAt;
}

function formatDateInputValue(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatTimeInputValue(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '18:00';
  }

  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${hours}:${minutes}`;
}

@Component({
  selector: 'app-create-event',
  imports: [
    FormField,
    RouterLink,
    CreateEventDatePickerComponent,
    CreateEventSelectComponent,
  ],
  templateUrl: './create-event.component.html',
  styleUrl: './create-event.component.css',
})
export class CreateEventComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);
  private readonly eventId = this.route.snapshot.paramMap.get('eventId');
  private readonly featureGraphicInput = viewChild<ElementRef<HTMLInputElement>>(
    'featureGraphicInput',
  );

  protected readonly isEditMode = this.eventId !== null;
  protected readonly optionsState = signal<OptionsState>('loading');
  protected readonly submissionState = signal<CreateEventState>('idle');
  protected readonly errorMessage = signal('');
  protected readonly assignableTalks = signal<AssignableTalk[]>([]);
  protected readonly venueOptions = signal<VenueOption[]>([]);
  protected readonly featureGraphic = signal<File | null>(null);
  protected readonly featureGraphicPreviewUrl = signal<string | null>(null);
  protected readonly featureGraphicFileName = signal('');
  protected readonly featureGraphicError = signal('');
  protected readonly featureGraphicTouched = signal(false);
  protected readonly createAttempted = signal(false);
  protected readonly maxImageSizeInMegabytes = EVENT_IMAGE_MAX_SIZE_BYTES / (1024 * 1024);
  protected readonly timeSelectOptions = EVENT_TIME_OPTIONS;

  protected readonly formModel = signal<CreateEventFormModel>({
    title: '',
    startsDate: '',
    startsTime: '18:00',
    meetupUrl: '',
    venueId: '',
    talks: [{ talkId: '' }, { talkId: '' }],
    isPublic: true,
  });

  protected readonly eventForm = form(this.formModel, (path) => {
    required(path.title, { message: 'Enter an event title.' });
    minLength(path.title, 3, { message: 'Use at least 3 characters.' });
    maxLength(path.title, 160, { message: 'Use no more than 160 characters.' });

    required(path.startsDate, { message: 'Select the event date.' });
    required(path.startsTime, { message: 'Select the event time.' });
    validate(path.startsTime, ({ value }) => {
      const startsTime = value();

      if (!startsTime || EVENT_TIME_VALUES.has(startsTime)) {
        return undefined;
      }

      return {
        kind: 'eventTimeSlot',
        message: 'Select one of the available 30-minute time slots.',
      };
    });
    validate(path.startsDate, ({ value, valueOf }) => {
      const startsDate = value();
      const startsTime = valueOf(path.startsTime);

      if (!startsDate || !startsTime) {
        return undefined;
      }

      const startsAt = parseLocalEventDateTime(startsDate, startsTime);

      if (!startsAt || startsAt.getTime() <= Date.now()) {
        return { kind: 'futureDate', message: 'Select a date and time in the future.' };
      }

      return undefined;
    });

    required(path.meetupUrl, { message: 'Enter the Meetup URL.' });
    maxLength(path.meetupUrl, 500, { message: 'Use no more than 500 characters.' });
    pattern(path.meetupUrl, HTTP_URL_PATTERN, {
      message: 'Enter a valid URL starting with http:// or https://.',
    });

    required(path.venueId, { message: 'Select a venue.' });
    minLength(path.talks, 2);
    maxLength(path.talks, 3);
    applyEach(path.talks, (talk) => {
      required(talk.talkId, { message: 'Select a talk.' });
    });
    validate(path.talks, ({ value }) => {
      const talkIds = value()
        .map((talk) => talk.talkId)
        .filter((talkId) => talkId.length > 0);

      if (new Set(talkIds).size !== talkIds.length) {
        return { kind: 'uniqueTalks', message: 'Each talk can be selected only once.' };
      }

      return undefined;
    });
  });

  protected readonly isSubmitting = computed(() => this.submissionState() === 'submitting');
  protected readonly canAddThirdTalk = computed(() => this.formModel().talks.length < 3);
  protected readonly hasInsufficientAssignableTalks = computed(
    () => this.optionsState() === 'ready' && this.assignableTalks().length < 2,
  );
  protected readonly canSubmit = computed(
    () =>
      this.optionsState() === 'ready' &&
      !this.isSubmitting() &&
      !this.eventForm().invalid() &&
      (this.featureGraphic() !== null || (this.isEditMode && !!this.featureGraphicPreviewUrl())) &&
      !this.featureGraphicError() &&
      !this.hasInsufficientAssignableTalks(),
  );
  protected readonly shouldShowTalkAvailabilityNotice = computed(
    () => this.createAttempted() && this.hasInsufficientAssignableTalks(),
  );
  protected readonly venueSelectOptions = computed<readonly CreateEventSelectOption[]>(() =>
    this.venueOptions().map((venue) => ({
      value: venue.id,
      label: this.getVenueLabel(venue),
    })),
  );

  protected setIsPublic(isPublic: boolean): void {
    this.formModel.update((model) => ({
      ...model,
      isPublic,
    }));
  }

  constructor() {
    void this.loadOptions();

    this.destroyRef.onDestroy(() => {
      this.revokeFeatureGraphicPreviewUrl();
    });
  }

  protected addThirdTalk(): void {
    if (!this.canAddThirdTalk()) {
      return;
    }

    this.formModel.update((model) => ({
      ...model,
      talks: [...model.talks, { talkId: '' }],
    }));
  }

  protected removeThirdTalk(): void {
    this.formModel.update((model) => ({
      ...model,
      talks: model.talks.slice(0, 2),
    }));
  }

  protected isTalkSelectedElsewhere(talkId: string, currentIndex: number): boolean {
    return this.formModel().talks.some(
      (selection, index) => index !== currentIndex && selection.talkId === talkId,
    );
  }

  protected getTalkSpeakerLabel(talk: AssignableTalk): string {
    const speakerNames = talk.speaker_links
      .map((link) =>
        [link.speaker?.first_name, link.speaker?.last_name]
          .filter((name): name is string => Boolean(name?.trim()))
          .join(' '),
      )
      .filter((name) => name.length > 0);

    return speakerNames.length > 0 ? speakerNames.join(', ') : 'Speaker unavailable';
  }

  protected getVenueLabel(venue: VenueOption): string {
    return `${venue.title} - ${venue.street}, ${venue.zip} ${venue.city}`;
  }

  protected getTalkSelectOptions(currentIndex: number): readonly CreateEventSelectOption[] {
    return this.assignableTalks().map((talk) => ({
      value: talk.id,
      label: `${talk.title} - ${this.getTalkSpeakerLabel(talk)}`,
      disabled: this.isTalkSelectedElsewhere(talk.id, currentIndex),
    }));
  }

  protected openFeatureGraphicPicker(): void {
    const input = this.featureGraphicInput()?.nativeElement;

    if (!input) {
      return;
    }

    input.value = '';
    input.click();
  }

  protected onFeatureGraphicSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      return;
    }

    this.featureGraphicTouched.set(true);
    this.featureGraphicError.set('');

    if (
      !EVENT_IMAGE_ALLOWED_TYPES.includes(
        file.type as (typeof EVENT_IMAGE_ALLOWED_TYPES)[number],
      )
    ) {
      input.value = '';
      this.featureGraphicError.set('Upload a JPG, PNG, or WebP image.');
      return;
    }

    if (file.size > EVENT_IMAGE_MAX_SIZE_BYTES) {
      input.value = '';
      this.featureGraphicError.set(
        `Upload an image smaller than ${this.maxImageSizeInMegabytes} MB.`,
      );
      return;
    }

    this.revokeFeatureGraphicPreviewUrl();
    this.featureGraphic.set(file);
    this.featureGraphicFileName.set(file.name);

    if (isPlatformBrowser(this.platformId)) {
      this.featureGraphicPreviewUrl.set(URL.createObjectURL(file));
    }
  }

  protected removeFeatureGraphic(): void {
    this.resetFeatureGraphicInput();
    this.featureGraphicTouched.set(true);
  }

  protected async saveEvent(): Promise<void> {
    this.createAttempted.set(true);

    if (this.hasInsufficientAssignableTalks()) {
      return;
    }

    this.featureGraphicTouched.set(true);

    if (!this.isEditMode && !this.featureGraphic()) {
      this.featureGraphicError.set('Upload an event image.');
    }

    await submit(this.eventForm, async () => {
      const featureGraphic = this.featureGraphic();

      if ((!this.isEditMode && !featureGraphic) || this.optionsState() !== 'ready') {
        return;
      }

      this.submissionState.set('submitting');
      this.errorMessage.set('');

      const model = this.formModel();
      const startsAt = parseLocalEventDateTime(model.startsDate, model.startsTime);

      if (!startsAt) {
        this.submissionState.set('idle');
        this.errorMessage.set('Select a valid event date and time.');
        return;
      }

      if (this.isEditMode) {
        if (!this.eventId) {
          this.submissionState.set('idle');
          this.errorMessage.set('We could not identify the event to update.');
          return;
        }

        const payload: UpdateEventPayload = {
          eventId: this.eventId,
          title: model.title.trim(),
          startsAt: startsAt.toISOString(),
          meetupUrl: model.meetupUrl.trim(),
          venueId: model.venueId,
          talkIds: model.talks.map((talk) => talk.talkId),
          featureGraphic,
          isPublic: model.isPublic,
        };
        const { data, error } = await this.supabaseService.updateEvent(payload);

        if (error || !data) {
          this.submissionState.set('idle');
          this.errorMessage.set(
            'We could not save the event changes. Check that the selected talks are still available and try again.',
          );
          return;
        }

        await this.router.navigate(['/dashboard/events']);
        return;
      }

      if (!featureGraphic) {
        return;
      }

      const payload: CreateEventPayload = {
        title: model.title.trim(),
        startsAt: startsAt.toISOString(),
        meetupUrl: model.meetupUrl.trim(),
        venueId: model.venueId,
        talkIds: model.talks.map((talk) => talk.talkId),
        featureGraphic,
        isPublic: model.isPublic,
      };
      const { data, error } = await this.supabaseService.createEvent(payload);

      if (error || !data) {
        this.submissionState.set('idle');
        this.errorMessage.set(
          'We could not create the event. Check that the selected talks are still available and try again.',
        );
        return;
      }

      await this.router.navigate(['/dashboard/events']);
    });
  }

  private async loadOptions(): Promise<void> {
    this.optionsState.set('loading');
    this.errorMessage.set('');

    const [talkResponse, venueResponse, eventResponse] = await Promise.all([
      this.supabaseService.getAssignableTalks(),
      this.supabaseService.getVenueOptions(),
      this.eventId ? this.supabaseService.getEventForEdit(this.eventId) : Promise.resolve(null),
    ]);

    if (talkResponse.error || venueResponse.error || eventResponse?.error) {
      this.optionsState.set('error');
      this.errorMessage.set(
        this.isEditMode
          ? 'We could not load the event. Refresh the page and try again.'
          : 'We could not load talks and venues. Refresh the page and try again.',
      );
      return;
    }

    const event = eventResponse?.data ?? null;
    const assignableTalks = event
      ? this.mergeAssignableTalks(talkResponse.data ?? [], event)
      : (talkResponse.data ?? []);

    this.assignableTalks.set(assignableTalks);
    this.venueOptions.set(venueResponse.data ?? []);

    if (event) {
      this.populateEventForm(event);
    }

    this.optionsState.set('ready');
  }

  private populateEventForm(event: ZurichEvent): void {
    const talks = event.talks.slice(0, 3).map((talk) => ({ talkId: talk.id }));

    while (talks.length < 2) {
      talks.push({ talkId: '' });
    }

    this.formModel.set({
      title: event.title,
      startsDate: formatDateInputValue(event.starts_at),
      startsTime: formatTimeInputValue(event.starts_at),
      meetupUrl: event.meetup_url,
      venueId: event.venue_id,
      talks,
      isPublic: event.public ?? true,
    });

    if (event.feature_graphic) {
      this.featureGraphicPreviewUrl.set(event.feature_graphic);
      this.featureGraphicFileName.set('Current event image');
    }
  }

  private mergeAssignableTalks(
    assignableTalks: AssignableTalk[],
    event: ZurichEvent,
  ): AssignableTalk[] {
    const talksById = new Map(assignableTalks.map((talk) => [talk.id, talk]));

    for (const talk of event.talks) {
      if (talksById.has(talk.id)) {
        continue;
      }

      talksById.set(talk.id, {
        id: talk.id,
        source_talk_submission_id: talk.source_talk_submission_id ?? '',
        title: talk.title,
        speaker_links: talk.speaker_links.map((link) => ({
          speaker: link.speaker
            ? {
                first_name: link.speaker.first_name,
                last_name: link.speaker.last_name,
              }
            : null,
        })),
      });
    }

    return Array.from(talksById.values()).sort((first, second) =>
      first.title.localeCompare(second.title),
    );
  }

  private resetFeatureGraphicInput(): void {
    this.revokeFeatureGraphicPreviewUrl();
    this.featureGraphic.set(null);
    this.featureGraphicFileName.set('');
    this.featureGraphicError.set('');

    const input = this.featureGraphicInput()?.nativeElement;

    if (input) {
      input.value = '';
    }
  }

  private revokeFeatureGraphicPreviewUrl(): void {
    const previewUrl = this.featureGraphicPreviewUrl();

    if (previewUrl?.startsWith('blob:') && isPlatformBrowser(this.platformId)) {
      URL.revokeObjectURL(previewUrl);
    }

    this.featureGraphicPreviewUrl.set(null);
  }
}

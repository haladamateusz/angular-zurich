import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { ToastService } from '../../core/toast/toast.service';
import { Event } from '../../core/models/event.interface';
import { EventDateFormatPipe } from '../../core/pipes/date-format/event-date-format.pipe';
import { splitTextIntoParagraphs } from '../../core/utils/split-text-into-paragraphs';

const SLIDES_VISIBILITY_DELAY_MS = 2 * 60 * 60 * 1000;
type RemoveEventState = 'idle' | 'submitting';
type DialogFocusTarget = 'remove-cancel' | HTMLElement;

const EMPTY_EVENT: Event = {
  id: '',
  slug: '',
  title: '',
  feature_graphic: null,
  meetup_url: '',
  starts_at: '',
  venue_id: '',
  talks: [],
  venue: {
    title: '',
    street: '',
    city: '',
    zip: '',
    google_maps_url: '',
  },
};

@Component({
  selector: 'app-event-details',
  imports: [EventDateFormatPipe, RouterLink],
  templateUrl: './event-details.component.html',
  styleUrl: './event-details.component.css',
  host: {
    '(document:keydown)': 'handleRemoveEventDialogKeydown($event)',
  },
})
export class EventDetailsComponent {
  slug = input.required<string>();
  protected readonly loadingCards = [1, 2, 3];
  private readonly currentTimestamp = signal(Date.now());
  private readonly loadedFeatureGraphicUrl = signal<string | null>(null);

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);
  private readonly toastService = inject(ToastService);
  private readonly removeEventDialog = viewChild<ElementRef<HTMLElement>>('removeEventDialog');
  private readonly removeEventDialogCancelButton = viewChild<ElementRef<HTMLButtonElement>>(
    'removeEventDialogCancelButton',
  );
  private readonly pendingDialogFocus = signal<DialogFocusTarget | null>(null);
  private readonly applyDialogFocus = afterRenderEffect({
    write: () => {
      const target = this.pendingDialogFocus();

      if (!target) {
        return;
      }

      this.pendingDialogFocus.set(null);
      this.focusDialogTarget(target);
    },
  });
  private readonly lockBackgroundScrollWhileRemoveDialogIsOpen = effect((onCleanup) => {
    if (!this.isBrowser || !this.isRemoveEventDialogOpen()) {
      return;
    }

    const originalOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';

    onCleanup(() => {
      this.document.body.style.overflow = originalOverflow;
    });
  });
  private removeEventDialogTrigger: HTMLElement | null = null;
  protected readonly showDashboardEventsBackLink = signal(
    this.router.currentNavigation()?.extras.state?.['fromDashboardEvents'] === true,
  );
  protected readonly isRemoveEventDialogOpen = signal(false);
  protected readonly removeEventState = signal<RemoveEventState>('idle');
  protected readonly removeEventErrorMessage = signal('');

  protected readonly eventResource = resource<Event, string>({
    params: () => this.slug(),
    defaultValue: EMPTY_EVENT,
    loader: async ({ params }) => {
      const { data, error } = await this.supabaseService.getEventBySlug(params);

      if (error) {
        throw error;
      }

      return data ?? EMPTY_EVENT;
    },
  });

  protected readonly event = computed(() => this.eventResource.value());
  protected readonly featureGraphicLoaded = computed(() => {
    const featureGraphicUrl = this.event().feature_graphic;

    return Boolean(featureGraphicUrl) && this.loadedFeatureGraphicUrl() === featureGraphicUrl;
  });
  protected readonly pageTitle = computed(() =>
    this.event().title.replace(/^Angular Zurich\s+/i, '') || 'Event details',
  );

  private readonly scrollToTopOnSlugChange = afterRenderEffect(() => {
    this.slug();
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });

  constructor() {
    if (!this.isBrowser) {
      return;
    }

    const currentTimestampInterval = window.setInterval(() => {
      this.currentTimestamp.set(Date.now());
    }, 60_000);

    this.destroyRef.onDestroy(() => {
      window.clearInterval(currentTimestampInterval);
    });
  }

  protected formatSpeakerName(firstName: string | null, lastName: string | null): string {
    return [firstName, lastName].filter((value): value is string => Boolean(value)).join(' ');
  }

  protected canShowSlides(eventStartsAt: string): boolean {
    const eventStartTimestamp = Date.parse(eventStartsAt);

    if (Number.isNaN(eventStartTimestamp)) {
      return false;
    }

    return this.currentTimestamp() >= eventStartTimestamp + SLIDES_VISIBILITY_DELAY_MS;
  }

  protected markFeatureGraphicAsLoaded(featureGraphicUrl: string | null): void {
    this.loadedFeatureGraphicUrl.set(featureGraphicUrl);
  }

  protected openRemoveEventDialog(event: globalThis.Event): void {
    if (!this.event().id || this.removeEventState() === 'submitting') {
      return;
    }

    this.removeEventDialogTrigger =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : this.document.activeElement instanceof HTMLElement
          ? this.document.activeElement
          : null;
    this.removeEventErrorMessage.set('');
    this.isRemoveEventDialogOpen.set(true);
    this.scheduleDialogFocus('remove-cancel');
  }

  protected closeRemoveEventDialog(): void {
    if (this.removeEventState() === 'submitting') {
      return;
    }

    this.isRemoveEventDialogOpen.set(false);
    this.restoreRemoveEventDialogTriggerFocusAfterRender();
  }

  protected closeRemoveEventDialogFromBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeRemoveEventDialog();
    }
  }

  protected handleRemoveEventDialogKeydown(event: KeyboardEvent): void {
    if (!this.isRemoveEventDialogOpen()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeRemoveEventDialog();
      return;
    }

    if (event.key === 'Tab') {
      const dialog = this.removeEventDialog()?.nativeElement;

      if (dialog) {
        this.trapDialogFocus(event, dialog);
      }
    }
  }

  protected async removeEvent(): Promise<void> {
    const eventId = this.event().id;

    if (!eventId || this.removeEventState() === 'submitting') {
      return;
    }

    this.removeEventState.set('submitting');
    this.removeEventErrorMessage.set('');

    const { data, error } = await this.supabaseService.removeEvent(eventId);

    if (error || !data) {
      this.removeEventErrorMessage.set('We could not remove this event. Please try again.');
      this.removeEventState.set('idle');
      return;
    }

    this.toastService.success('Event removed.');
    await this.router.navigate(['/dashboard/events']);
  }

  protected splitTalkDescription(description: string): string[] {
    return splitTextIntoParagraphs(description);
  }

  private trapDialogFocus(event: KeyboardEvent, dialog: HTMLElement): void {
    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) => element.tabIndex >= 0 && element.getAttribute('aria-disabled') !== 'true',
    );
    const firstElement = focusableElements.at(0);
    const lastElement = focusableElements.at(-1);

    if (!firstElement || !lastElement) {
      event.preventDefault();
      return;
    }

    const activeElement = this.document.activeElement;

    if (event.shiftKey && (activeElement === firstElement || !dialog.contains(activeElement))) {
      event.preventDefault();
      lastElement.focus();
      return;
    }

    if (!event.shiftKey && (activeElement === lastElement || !dialog.contains(activeElement))) {
      event.preventDefault();
      firstElement.focus();
    }
  }

  private restoreRemoveEventDialogTriggerFocusAfterRender(): void {
    const trigger = this.removeEventDialogTrigger;
    this.removeEventDialogTrigger = null;

    if (trigger) {
      this.pendingDialogFocus.set(trigger);
    }
  }

  private scheduleDialogFocus(target: Exclude<DialogFocusTarget, HTMLElement>): void {
    this.pendingDialogFocus.set(target);
    this.document.defaultView?.setTimeout(() => this.focusDialogTarget(target), 0);
  }

  private focusDialogTarget(target: DialogFocusTarget): void {
    if (target === 'remove-cancel') {
      this.removeEventDialogCancelButton()?.nativeElement.focus();
      return;
    }

    if (target.isConnected && !target.matches(':disabled')) {
      target.focus();
    }
  }
}

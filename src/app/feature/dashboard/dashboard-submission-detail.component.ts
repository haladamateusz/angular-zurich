import { DOCUMENT, DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { ToastService } from '../../core/toast/toast.service';
import {
  OrganizerTalkSubmissionDetail,
  OrganizerTalkSubmissionStatusEvent,
  TalkSubmissionReviewAction,
  TalkSubmissionStatus,
} from '../../core/models/organizer-talk-submission.interface';

interface SpeakerProfileLink {
  href: string;
  displayText: string;
  kind: 'personal' | 'linkedin' | 'github';
}

type ReviewActionState = 'idle' | 'submitting';
type ReviewMessageAction = Exclude<TalkSubmissionReviewAction, 'approve'>;
type DialogFocusTarget = 'remove-cancel' | 'review-message' | HTMLElement;

@Component({
  selector: 'app-dashboard-submission-detail',
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard-submission-detail.component.html',
  styleUrl: './dashboard-submission-detail.component.css',
  host: {
    '(document:keydown)': 'handleDialogKeydown($event)',
  },
})
export class DashboardSubmissionDetailComponent {
  private readonly document = inject(DOCUMENT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);
  private readonly toastService = inject(ToastService);
  private readonly reviewMessageInput =
    viewChild<ElementRef<HTMLTextAreaElement>>('reviewMessageInput');
  private readonly reviewMessageDialog = viewChild<ElementRef<HTMLElement>>('reviewMessageDialog');
  private readonly removeDialogCancelButton = viewChild<ElementRef<HTMLButtonElement>>(
    'removeDialogCancelButton',
  );
  private readonly removeSubmissionDialog =
    viewChild<ElementRef<HTMLElement>>('removeSubmissionDialog');
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
  private readonly lockBackgroundScrollWhileDialogIsOpen = effect((onCleanup) => {
    if (!this.activeMessageAction() && !this.isRemoveDialogOpen()) {
      return;
    }

    const originalOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';

    onCleanup(() => {
      this.document.body.style.overflow = originalOverflow;
    });
  });
  private dialogTrigger: HTMLElement | null = null;

  protected readonly submissionId = this.route.snapshot.paramMap.get('submissionId') ?? '';
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly reviewErrorMessage = signal('');
  protected readonly reviewActionState = signal<ReviewActionState>('idle');
  protected readonly activeMessageAction = signal<ReviewMessageAction | null>(null);
  protected readonly isRemoveDialogOpen = signal(false);
  protected readonly reviewNotes = signal('');
  protected readonly speakerPictureUrl = signal<string | null>(null);
  protected readonly submission = signal<OrganizerTalkSubmissionDetail | null>(null);
  protected readonly statusEvents = signal<OrganizerTalkSubmissionStatusEvent[]>([]);
  protected readonly orderedStatusEvents = computed(() =>
    [...this.statusEvents()].sort(
      (left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    ),
  );
  protected readonly isFinalized = computed(() => {
    const status = this.submission()?.status;

    return status === 'approved' || status === 'assigned_to_event' || status === 'rejected';
  });
  protected readonly speakerProfileLinks = computed<SpeakerProfileLink[]>(() => {
    const currentSubmission = this.submission();

    if (!currentSubmission) {
      return [];
    }

    const links: SpeakerProfileLink[] = [];

    if (currentSubmission.personal_url) {
      links.push({
        href: currentSubmission.personal_url,
        displayText: this.formatSpeakerProfileLink(currentSubmission.personal_url, 'personal'),
        kind: 'personal',
      });
    }

    if (currentSubmission.linkedin_url) {
      links.push({
        href: currentSubmission.linkedin_url,
        displayText: this.formatSpeakerProfileLink(currentSubmission.linkedin_url, 'linkedin'),
        kind: 'linkedin',
      });
    }

    if (currentSubmission.github_url) {
      links.push({
        href: currentSubmission.github_url,
        displayText: this.formatSpeakerProfileLink(currentSubmission.github_url, 'github'),
        kind: 'github',
      });
    }

    return links;
  });

  constructor() {
    void this.loadSubmission();
  }

  protected formatStatus(status: TalkSubmissionStatus): string {
    switch (status) {
      case 'initially_submitted':
        return 'Initially submitted';
      case 'approved':
        return 'Approved';
      case 'assigned_to_event':
        return 'Assigned to event';
      case 'changes_requested':
        return 'Changes requested';
      case 'rejected':
        return 'Rejected';
      case 'adjusted':
        return 'Adjusted';
      case 'changes_submitted':
        return 'Changes submitted';
    }
  }

  protected getStatusLogMarkerClass(status: TalkSubmissionStatus): string {
    const modifier = (() => {
      switch (status) {
        case 'initially_submitted':
          return 'dashboard-detail__log-marker--submitted';
        case 'approved':
          return 'dashboard-detail__log-marker--approved';
        case 'assigned_to_event':
          return 'dashboard-detail__log-marker--assigned';
        case 'changes_requested':
        case 'changes_submitted':
          return 'dashboard-detail__log-marker--changes';
        case 'rejected':
          return 'dashboard-detail__log-marker--rejected';
        case 'adjusted':
          return 'dashboard-detail__log-marker--adjusted';
      }
    })();

    return `dashboard-detail__log-marker ${modifier}`;
  }

  protected updateReviewNotes(event: Event): void {
    const target = event.target;

    if (!(target instanceof HTMLTextAreaElement)) {
      return;
    }

    this.reviewNotes.set(target.value);
  }

  protected formatAction(event: OrganizerTalkSubmissionStatusEvent): string {
    switch (event.action) {
      case 'submitted':
        return 'Submitted';
      case 'adjusted':
        return 'Adjusted';
      case 'changes_submitted':
        return 'Changes submitted';
      case 'approved':
        return 'Approved';
      case 'assigned_to_event':
        return 'Assigned to event';
      case 'removed_from_event':
        return 'Removed from event';
      case 'changes_requested':
        return 'Changes requested';
      case 'rejected':
        return 'Rejected';
    }
  }

  protected formatActor(event: OrganizerTalkSubmissionStatusEvent): string {
    const actorName = [event.actor_first_name, event.actor_last_name]
      .filter((value): value is string => Boolean(value))
      .join(' ');

    if (actorName) {
      return actorName;
    }

    switch (event.actor_kind) {
      case 'speaker':
        return 'Speaker';
      case 'reviewer':
        return 'Reviewer';
      case 'system':
        return 'System';
    }
  }

  protected getReviewModalTitle(action: ReviewMessageAction): string {
    return action === 'request_changes' ? 'Request changes' : 'Reject submission';
  }

  protected getReviewModalDescription(action: ReviewMessageAction): string {
    return action === 'request_changes'
      ? 'Write the changes the speaker should make before submitting again.'
      : 'Write the rejection reason that will be sent to the speaker later.';
  }

  protected canStartReviewAction(action: TalkSubmissionReviewAction): boolean {
    const status = this.submission()?.status;

    if (this.reviewActionState() === 'submitting' || this.isFinalized()) {
      return false;
    }

    if (status === 'changes_requested' && action !== 'reject') {
      return false;
    }

    if (action === 'approve') {
      return status !== 'changes_requested';
    }

    return true;
  }

  protected canSubmitReviewAction(action: TalkSubmissionReviewAction): boolean {
    if (!this.canStartReviewAction(action)) {
      return false;
    }

    if (action === 'approve') {
      return true;
    }

    return this.reviewNotes().trim().length > 0;
  }

  protected openReviewMessageModal(action: ReviewMessageAction, event?: Event): void {
    if (!this.canStartReviewAction(action)) {
      return;
    }

    this.captureDialogTrigger(event);
    this.reviewNotes.set('');
    this.reviewErrorMessage.set('');
    this.activeMessageAction.set(action);
    this.scheduleDialogFocus('review-message');
  }

  protected closeReviewMessageModal(): void {
    if (this.reviewActionState() === 'submitting') {
      return;
    }

    this.activeMessageAction.set(null);
    this.reviewErrorMessage.set('');
    this.reviewNotes.set('');
    this.restoreDialogTriggerFocusAfterRender();
  }

  protected closeReviewMessageModalFromBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeReviewMessageModal();
    }
  }

  protected handleDialogKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();

      if (this.isRemoveDialogOpen()) {
        this.closeRemoveDialog();
        return;
      }

      if (this.activeMessageAction()) {
        this.closeReviewMessageModal();
      }

      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const dialog = this.activeMessageAction()
      ? this.reviewMessageDialog()?.nativeElement
      : this.isRemoveDialogOpen()
        ? this.removeSubmissionDialog()?.nativeElement
        : undefined;

    if (dialog) {
      this.trapDialogFocus(event, dialog);
    }
  }

  protected openRemoveDialog(event?: Event): void {
    if (this.reviewActionState() === 'submitting') {
      return;
    }

    this.captureDialogTrigger(event);
    this.reviewErrorMessage.set('');
    this.isRemoveDialogOpen.set(true);
    this.scheduleDialogFocus('remove-cancel');
  }

  protected closeRemoveDialog(): void {
    if (this.reviewActionState() === 'submitting') {
      return;
    }

    this.isRemoveDialogOpen.set(false);
    this.restoreDialogTriggerFocusAfterRender();
  }

  protected closeRemoveDialogFromBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeRemoveDialog();
    }
  }

  protected async removeSubmission(): Promise<void> {
    if (!this.submissionId || this.reviewActionState() === 'submitting') {
      return;
    }

    this.reviewActionState.set('submitting');
    this.reviewErrorMessage.set('');

    const { data, error } = await this.supabaseService.removeTalkSubmission(this.submissionId);

    if (error || !data) {
      this.reviewErrorMessage.set('We could not remove this submission. Please try again.');
      this.reviewActionState.set('idle');
      return;
    }

    await this.router.navigate(['/dashboard/talk-submissions']);
  }

  protected async submitReviewAction(action: TalkSubmissionReviewAction): Promise<void> {
    if (!this.submissionId || !this.canSubmitReviewAction(action)) {
      if (action !== 'approve' && this.reviewNotes().trim().length === 0) {
        this.reviewErrorMessage.set('Please add a message before requesting changes or rejecting.');
      }

      return;
    }

    this.reviewActionState.set('submitting');
    this.reviewErrorMessage.set('');

    const { data, error } = await this.supabaseService.reviewTalkSubmission(
      this.submissionId,
      action,
      action === 'approve' ? null : this.reviewNotes().trim(),
    );

    if (error || !data?.[0]) {
      this.reviewErrorMessage.set('We could not update this submission. Please try again.');
      this.reviewActionState.set('idle');
      return;
    }

    const currentSubmission = this.submission();
    const updatedStatus = data[0].status as TalkSubmissionStatus;

    if (currentSubmission) {
      this.submission.set({
        ...currentSubmission,
        status: updatedStatus,
      });
    }

    this.reviewNotes.set('');
    this.activeMessageAction.set(null);
    this.dialogTrigger = null;
    this.toastService.success(this.getReviewSuccessMessage(action));
    await this.loadStatusEvents();
    this.reviewActionState.set('idle');
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

  private captureDialogTrigger(event?: Event): void {
    const currentTarget = event?.currentTarget;

    this.dialogTrigger =
      currentTarget instanceof HTMLElement
        ? currentTarget
        : this.document.activeElement instanceof HTMLElement
          ? this.document.activeElement
          : null;
  }

  private restoreDialogTriggerFocusAfterRender(): void {
    const trigger = this.dialogTrigger;
    this.dialogTrigger = null;

    if (!trigger) {
      return;
    }

    this.pendingDialogFocus.set(trigger);
  }

  private scheduleDialogFocus(target: Exclude<DialogFocusTarget, HTMLElement>): void {
    this.pendingDialogFocus.set(target);
    this.document.defaultView?.setTimeout(() => this.focusDialogTarget(target), 0);
  }

  private focusDialogTarget(target: DialogFocusTarget): void {
    if (target === 'review-message') {
      this.reviewMessageInput()?.nativeElement.focus();
      return;
    }

    if (target === 'remove-cancel') {
      this.removeDialogCancelButton()?.nativeElement.focus();
      return;
    }

    if (target.isConnected && !target.matches(':disabled')) {
      target.focus();
    }
  }

  private formatSpeakerProfileLink(value: string, kind: SpeakerProfileLink['kind']): string {
    try {
      const url = new URL(value);
      const normalizedPath = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
      const normalizedHost = url.hostname.replace(/^www\./, '');

      switch (kind) {
        case 'personal':
          return `${normalizedHost}${url.pathname.replace(/\/+$/, '')}${url.search}${url.hash}`;
        case 'linkedin':
          return normalizedPath.replace(/^in\//, '') || normalizedHost;
        case 'github':
          return normalizedPath || normalizedHost;
      }
    } catch {
      return value
        .replace(/^https?:\/\//i, '')
        .replace(/^www\./i, '')
        .replace(/\/+$/, '');
    }
  }

  private async loadSubmission(): Promise<void> {
    if (!this.submissionId) {
      this.errorMessage.set('We could not determine which submission to load.');
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { data, error } = await this.supabaseService.getOrganizerTalkSubmissionById(
      this.submissionId,
    );

    if (error || !data) {
      this.errorMessage.set(
        'We could not load this talk submission right now. Please go back and try again.',
      );
      this.submission.set(null);
      this.isLoading.set(false);
      return;
    }

    this.submission.set(data);
    await this.loadStatusEvents();

    if (data.speaker_picture_path) {
      const signedUrl = await this.supabaseService.getOrganizerSpeakerPictureUrl(
        data.speaker_picture_path,
      );
      this.speakerPictureUrl.set(signedUrl);
    } else {
      this.speakerPictureUrl.set(null);
    }

    this.isLoading.set(false);
  }

  private async loadStatusEvents(): Promise<void> {
    const { data, error } = await this.supabaseService.getOrganizerTalkSubmissionStatusEvents(
      this.submissionId,
    );

    this.statusEvents.set(error ? [] : (data ?? []));
  }

  private getReviewSuccessMessage(action: TalkSubmissionReviewAction): string {
    switch (action) {
      case 'approve':
        return 'Submission approved and copied to talks.';
      case 'request_changes':
        return 'Changes requested.';
      case 'reject':
        return 'Submission rejected.';
    }
  }
}

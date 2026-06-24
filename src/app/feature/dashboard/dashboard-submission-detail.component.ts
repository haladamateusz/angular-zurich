import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
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

@Component({
  selector: 'app-dashboard-submission-detail',
  imports: [DatePipe],
  templateUrl: './dashboard-submission-detail.component.html',
  styleUrl: './dashboard-submission-detail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardSubmissionDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly supabaseService = inject(SupabaseService);

  protected readonly submissionId = this.route.snapshot.paramMap.get('submissionId') ?? '';
  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly successMessage = signal('');
  protected readonly reviewErrorMessage = signal('');
  protected readonly reviewActionState = signal<ReviewActionState>('idle');
  protected readonly activeMessageAction = signal<ReviewMessageAction | null>(null);
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

  protected openReviewMessageModal(action: ReviewMessageAction): void {
    if (!this.canStartReviewAction(action)) {
      return;
    }

    this.reviewNotes.set('');
    this.reviewErrorMessage.set('');
    this.successMessage.set('');
    this.activeMessageAction.set(action);
  }

  protected closeReviewMessageModal(): void {
    if (this.reviewActionState() === 'submitting') {
      return;
    }

    this.activeMessageAction.set(null);
    this.reviewErrorMessage.set('');
    this.reviewNotes.set('');
  }

  protected closeReviewMessageModalFromBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closeReviewMessageModal();
    }
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
    this.successMessage.set('');

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
    this.successMessage.set(this.getReviewSuccessMessage(action));
    await this.loadStatusEvents();
    this.reviewActionState.set('idle');
  }

  private formatSpeakerProfileLink(
    value: string,
    kind: SpeakerProfileLink['kind'],
  ): string {
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

    const { data, error } = await this.supabaseService.getOrganizerTalkSubmissionById(this.submissionId);

    if (error || !data) {
      this.errorMessage.set('We could not load this talk submission right now. Please go back and try again.');
      this.submission.set(null);
      this.isLoading.set(false);
      return;
    }

    this.submission.set(data);
    await this.loadStatusEvents();

    if (data.speaker_picture_path) {
      const signedUrl = await this.supabaseService.getOrganizerSpeakerPictureUrl(data.speaker_picture_path);
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

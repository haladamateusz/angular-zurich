import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { TalkSubmissionDeviceAuthService } from '../../core/data-access/talk-submission-device-auth.service';
import {
  TalkSubmissionStatus,
  TalkSubmissionStatusSummary,
} from '../../core/models/talk-submission.interface';

@Component({
  selector: 'app-submit-talk-success',
  imports: [RouterLink],
  templateUrl: './submit-talk-success.component.html',
  styleUrl: './submit-talk-success.component.css'
})
export class SubmitTalkSuccessComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly supabaseService = inject(SupabaseService);
  private readonly talkSubmissionDeviceAuthService = inject(TalkSubmissionDeviceAuthService);

  protected readonly submissionId = signal(this.route.snapshot.paramMap.get('submissionId'));
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly statusSummary = signal<TalkSubmissionStatusSummary | null>(null);

  protected readonly hasSubmissionId = computed(
    () => this.submissionId() !== null && this.submissionId() !== 'submitted',
  );
  protected readonly isDeviceRecognized = computed(() =>
    this.talkSubmissionDeviceAuthService.hasEditToken(this.submissionId()),
  );

  constructor() {
    void this.loadSubmissionStatus();
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

  private async loadSubmissionStatus(): Promise<void> {
    if (!this.hasSubmissionId()) {
      return;
    }

    const submissionId = this.submissionId();
    const editToken = this.talkSubmissionDeviceAuthService.getEditToken(submissionId);

    if (!submissionId || !editToken) {
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set('');

    const { data, error } = await this.supabaseService.getTalkSubmissionStatusForDevice(
      submissionId,
      editToken,
    );

    if (error) {
      this.errorMessage.set('We could not load the current submission status.');
      this.statusSummary.set(null);
      this.isLoading.set(false);
      return;
    }

    this.statusSummary.set(data);
    this.isLoading.set(false);
  }
}

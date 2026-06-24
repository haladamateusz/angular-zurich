import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import {
  OrganizerTalkSubmission,
  TalkSubmissionStatus,
} from '../../core/models/organizer-talk-submission.interface';

type SortColumn = 'title' | 'author' | 'dateSent' | 'status';
type SortDirection = 'asc' | 'desc';

interface DashboardTalkSubmission extends OrganizerTalkSubmission {
  speakerInitials: string;
  speakerPictureUrl: string | null;
}

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  private readonly authService = inject(AuthService);
  private readonly supabaseService = inject(SupabaseService);

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly submissions = signal<DashboardTalkSubmission[]>([]);
  protected readonly sortColumn = signal<SortColumn>('dateSent');
  protected readonly sortDirection = signal<SortDirection>('desc');

  protected readonly displayName = computed(
    () => this.authService.userProfile()?.displayName ?? 'Organizer',
  );
  protected readonly hasSubmissions = computed(() => this.submissions().length > 0);
  protected readonly sortedSubmissions = computed(() => {
    const direction = this.sortDirection() === 'asc' ? 1 : -1;

    return [...this.submissions()].sort((left, right) => {
      const comparison = this.compareSubmissions(left, right, this.sortColumn());

      return comparison * direction;
    });
  });

  constructor() {
    void this.loadTalkSubmissions();
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

  protected toggleSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }

    this.sortColumn.set(column);
    this.sortDirection.set(column === 'dateSent' ? 'desc' : 'asc');
  }

  protected getAriaSort(column: SortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) {
      return 'none';
    }

    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  private compareSubmissions(
    left: DashboardTalkSubmission,
    right: DashboardTalkSubmission,
    column: SortColumn,
  ): number {
    switch (column) {
      case 'title':
        return left.talk_title.localeCompare(right.talk_title, undefined, { sensitivity: 'base' });
      case 'author':
        return left.speaker_name.localeCompare(right.speaker_name, undefined, {
          sensitivity: 'base',
        });
      case 'dateSent':
        return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
      case 'status':
        return this.getStatusSortValue(left.status) - this.getStatusSortValue(right.status);
    }
  }

  private getStatusSortValue(status: TalkSubmissionStatus): number {
    switch (status) {
      case 'initially_submitted':
        return 0;
      case 'adjusted':
        return 1;
      case 'changes_requested':
        return 2;
      case 'changes_submitted':
        return 3;
      case 'approved':
        return 4;
      case 'assigned_to_event':
        return 5;
      case 'rejected':
        return 6;
    }
  }

  private async loadTalkSubmissions(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    const { data, error } = await this.supabaseService.getOrganizerTalkSubmissions();

    if (error) {
      this.errorMessage.set(
        'We could not load talk submissions right now. Please refresh and try again.',
      );
      this.submissions.set([]);
      this.isLoading.set(false);
      return;
    }

    this.submissions.set(await this.createDashboardSubmissions(data ?? []));
    this.isLoading.set(false);
  }

  private async createDashboardSubmissions(
    submissions: OrganizerTalkSubmission[],
  ): Promise<DashboardTalkSubmission[]> {
    return Promise.all(
      submissions.map(async (submission) => ({
        ...submission,
        speakerInitials: this.getSpeakerInitials(submission.speaker_name),
        speakerPictureUrl: submission.speaker_picture_path
          ? await this.supabaseService.getOrganizerSpeakerPictureUrl(submission.speaker_picture_path)
          : null,
      })),
    );
  }

  private getSpeakerInitials(name: string): string {
    const [firstName, secondName] = name.trim().split(/\s+/);
    const initials = `${firstName?.charAt(0) ?? ''}${secondName?.charAt(0) ?? ''}`;

    return initials ? initials.toUpperCase() : '?';
  }
}

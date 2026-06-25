import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  type WritableSignal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import {
  OrganizerTalkSubmissionSortColumn,
  SupabaseService,
} from '../../core/data-access/supabase/supabase.service';
import {
  OrganizerTalkSubmission,
  TalkSubmissionStatus,
} from '../../core/models/organizer-talk-submission.interface';

type SortColumn = 'title' | 'author' | 'dateSent' | 'status';
type SortDirection = 'asc' | 'desc';
type StatusFilter = TalkSubmissionStatus | '';
const SUBMISSIONS_PAGE_SIZE = 5;
const TALK_SUBMISSION_STATUSES: readonly TalkSubmissionStatus[] = [
  'initially_submitted',
  'approved',
  'assigned_to_event',
  'changes_requested',
  'rejected',
  'adjusted',
  'changes_submitted',
];

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
  protected readonly totalSubmissionCount = signal(0);
  protected readonly sortColumn = signal<SortColumn>('dateSent');
  protected readonly sortDirection = signal<SortDirection>('desc');
  protected readonly currentPage = signal(1);
  protected readonly titleFilter = signal('');
  protected readonly authorFilter = signal('');
  protected readonly statusFilter = signal<StatusFilter>('');
  private latestLoadId = 0;

  protected readonly statusFilterOptions = TALK_SUBMISSION_STATUSES;
  protected readonly displayName = computed(
    () => this.authService.userProfile()?.displayName ?? 'Organizer',
  );
  protected readonly hasSubmissions = computed(() => this.submissions().length > 0);
  protected readonly hasActiveFilters = computed(() =>
    Boolean(this.titleFilter().trim() || this.authorFilter().trim() || this.statusFilter()),
  );
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalSubmissionCount() / SUBMISSIONS_PAGE_SIZE)),
  );
  protected readonly pageNumbers = computed(() =>
    Array.from({ length: this.totalPages() }, (_, index) => index + 1),
  );
  protected readonly paginatedSubmissions = computed(() => this.submissions());
  protected readonly currentPageStart = computed(() => {
    if (!this.totalSubmissionCount()) {
      return 0;
    }

    return (this.currentPage() - 1) * SUBMISSIONS_PAGE_SIZE + 1;
  });
  protected readonly currentPageEnd = computed(() =>
    Math.min(this.currentPage() * SUBMISSIONS_PAGE_SIZE, this.totalSubmissionCount()),
  );

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
      this.currentPage.set(1);
      void this.loadTalkSubmissions();
      return;
    }

    this.sortColumn.set(column);
    this.sortDirection.set(column === 'dateSent' ? 'desc' : 'asc');
    this.currentPage.set(1);
    void this.loadTalkSubmissions();
  }

  protected getAriaSort(column: SortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) {
      return 'none';
    }

    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  protected goToPreviousPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  protected goToNextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  protected goToPage(page: number): void {
    const nextPage = Math.min(this.totalPages(), Math.max(1, page));

    if (nextPage === this.currentPage()) {
      return;
    }

    this.currentPage.set(nextPage);
    void this.loadTalkSubmissions();
  }

  protected updateTitleFilter(event: Event): void {
    this.updateFilter(this.titleFilter, this.getControlValue(event));
  }

  protected updateAuthorFilter(event: Event): void {
    this.updateFilter(this.authorFilter, this.getControlValue(event));
  }

  protected updateStatusFilter(event: Event): void {
    const value = this.getControlValue(event);
    const status = TALK_SUBMISSION_STATUSES.includes(value as TalkSubmissionStatus)
      ? (value as TalkSubmissionStatus)
      : '';

    this.updateFilter(this.statusFilter, status);
  }

  protected clearFilters(): void {
    if (!this.hasActiveFilters()) {
      return;
    }

    this.titleFilter.set('');
    this.authorFilter.set('');
    this.statusFilter.set('');
    this.currentPage.set(1);
    void this.loadTalkSubmissions();
  }

  private getSortColumn(column: SortColumn): OrganizerTalkSubmissionSortColumn {
    switch (column) {
      case 'title':
        return 'talk_title';
      case 'author':
        return 'speaker_name';
      case 'dateSent':
        return 'created_at';
      case 'status':
        return 'status';
    }
  }

  private async loadTalkSubmissions(): Promise<void> {
    const loadId = this.latestLoadId + 1;
    this.latestLoadId = loadId;
    this.isLoading.set(true);
    this.errorMessage.set('');

    const { count, data, error } = await this.supabaseService.getOrganizerTalkSubmissions({
      page: this.currentPage(),
      pageSize: SUBMISSIONS_PAGE_SIZE,
      sortColumn: this.getSortColumn(this.sortColumn()),
      sortDirection: this.sortDirection(),
      filters: {
        author: this.authorFilter(),
        status: this.statusFilter() || undefined,
        title: this.titleFilter(),
      },
    });

    if (loadId !== this.latestLoadId) {
      return;
    }

    if (error) {
      this.errorMessage.set(
        'We could not load talk submissions right now. Please refresh and try again.',
      );
      this.submissions.set([]);
      this.totalSubmissionCount.set(0);
      this.isLoading.set(false);
      return;
    }

    this.submissions.set(await this.createDashboardSubmissions(data ?? []));
    this.totalSubmissionCount.set(count ?? data?.length ?? 0);
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

  private getControlValue(event: Event): string {
    const target = event.target;

    return target instanceof HTMLInputElement || target instanceof HTMLSelectElement
      ? target.value
      : '';
  }

  private updateFilter<T extends string>(filter: WritableSignal<T>, value: T): void {
    if (value === filter()) {
      return;
    }

    filter.set(value);
    this.currentPage.set(1);
    void this.loadTalkSubmissions();
  }
}

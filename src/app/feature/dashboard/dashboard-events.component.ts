import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal, type WritableSignal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DashboardEventSortColumn,
  DashboardEventVisibilityFilter,
  SupabaseService,
} from '../../core/data-access/supabase/supabase.service';
import { DashboardEvent } from '../../core/models/event.interface';
import { CreateEventSelectOption } from './create-event-select.component';
import { createPaginationItems } from './pagination';
import {
  DashboardTableDateRange,
  DashboardTableFilterComponent,
} from './dashboard-table-filter.component';

const EVENTS_PAGE_SIZE = 5;
type SortColumn = 'date' | 'title' | 'visibility';
type SortDirection = 'asc' | 'desc';
type VisibilityFilter = DashboardEventVisibilityFilter | '';

@Component({
  selector: 'app-dashboard-events',
  imports: [DatePipe, NgTemplateOutlet, RouterLink, DashboardTableFilterComponent],
  templateUrl: './dashboard-events.component.html',
  styleUrl: './dashboard-events.component.css',
})
export class DashboardEventsComponent {
  private readonly supabaseService = inject(SupabaseService);
  private latestLoadId = 0;

  protected readonly isLoading = signal(true);
  private readonly hasLoaded = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly events = signal<DashboardEvent[]>([]);
  protected readonly totalEventCount = signal(0);
  protected readonly currentPage = signal(1);
  protected readonly sortColumn = signal<SortColumn>('date');
  protected readonly sortDirection = signal<SortDirection>('desc');
  protected readonly titleFilter = signal('');
  protected readonly startDateFilter = signal('');
  protected readonly endDateFilter = signal('');
  protected readonly visibilityFilter = signal<VisibilityFilter>('');
  protected readonly eventDetailsNavigationState = { fromDashboardEvents: true } as const;

  protected readonly visibilitySelectOptions: readonly CreateEventSelectOption[] = [
    { value: '', label: 'All visibility' },
    { value: 'public', label: 'Public' },
    { value: 'draft', label: 'Draft' },
  ];

  protected readonly hasEvents = computed(() => this.events().length > 0);
  protected readonly hasActiveFilters = computed(() =>
    Boolean(
      this.titleFilter().trim() ||
      this.startDateFilter() ||
      this.endDateFilter() ||
      this.visibilityFilter(),
    ),
  );
  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalEventCount() / EVENTS_PAGE_SIZE)),
  );
  protected readonly paginationItems = computed(() =>
    createPaginationItems(this.currentPage(), this.totalPages()),
  );
  protected readonly currentPageStart = computed(() => {
    if (!this.totalEventCount()) {
      return 0;
    }

    return (this.currentPage() - 1) * EVENTS_PAGE_SIZE + 1;
  });
  protected readonly currentPageEnd = computed(() =>
    Math.min(this.currentPage() * EVENTS_PAGE_SIZE, this.totalEventCount()),
  );

  constructor() {
    void this.loadEvents();
  }

  protected goToPreviousPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  protected goToNextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  protected toggleSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.update((direction) => (direction === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set(column === 'date' ? 'desc' : 'asc');
    }

    this.currentPage.set(1);
    void this.loadEvents();
  }

  protected getAriaSort(column: SortColumn): 'ascending' | 'descending' | 'none' {
    if (this.sortColumn() !== column) {
      return 'none';
    }

    return this.sortDirection() === 'asc' ? 'ascending' : 'descending';
  }

  protected updateTitleFilter(value: string): void {
    this.updateFilter(this.titleFilter, value);
  }

  protected updateDateRange({ startDate, endDate }: DashboardTableDateRange): void {
    if (this.startDateFilter() === startDate && this.endDateFilter() === endDate) {
      return;
    }

    this.startDateFilter.set(startDate);
    this.endDateFilter.set(endDate);
    this.currentPage.set(1);
    void this.loadEvents();
  }

  protected updateVisibilityFilter(value: string): void {
    const visibility = value === 'public' || value === 'draft' ? value : '';

    this.updateFilter(this.visibilityFilter, visibility);
  }

  protected clearFilters(): void {
    if (!this.hasActiveFilters()) {
      return;
    }

    this.titleFilter.set('');
    this.startDateFilter.set('');
    this.endDateFilter.set('');
    this.visibilityFilter.set('');
    this.currentPage.set(1);
    void this.loadEvents();
  }

  protected goToPage(page: number): void {
    const nextPage = Math.min(this.totalPages(), Math.max(1, page));

    if (nextPage === this.currentPage()) {
      return;
    }

    this.currentPage.set(nextPage);
    void this.loadEvents();
  }

  private getSortColumn(column: SortColumn): DashboardEventSortColumn {
    switch (column) {
      case 'date':
        return 'starts_at';
      case 'title':
        return 'title';
      case 'visibility':
        return 'public';
    }
  }

  private updateFilter<T extends string>(filter: WritableSignal<T>, value: T): void {
    if (filter() === value) {
      return;
    }

    filter.set(value);
    this.currentPage.set(1);
    void this.loadEvents();
  }

  private async loadEvents(): Promise<void> {
    const loadId = this.latestLoadId + 1;
    this.latestLoadId = loadId;
    this.isLoading.set(!this.hasLoaded());
    this.errorMessage.set('');

    const { count, data, error } = await this.supabaseService.getDashboardEvents({
      page: this.currentPage(),
      pageSize: EVENTS_PAGE_SIZE,
      sortColumn: this.getSortColumn(this.sortColumn()),
      sortDirection: this.sortDirection(),
      filters: {
        endDate: this.endDateFilter() || undefined,
        startDate: this.startDateFilter() || undefined,
        title: this.titleFilter().trim() || undefined,
        visibility: this.visibilityFilter() || undefined,
      },
    });

    if (loadId !== this.latestLoadId) {
      return;
    }

    if (error) {
      this.errorMessage.set('We could not load events right now. Please refresh and try again.');
      this.events.set([]);
      this.totalEventCount.set(0);
      this.isLoading.set(false);
      return;
    }

    this.events.set(data ?? []);
    this.totalEventCount.set(count ?? data?.length ?? 0);
    this.hasLoaded.set(true);
    this.isLoading.set(false);
  }
}

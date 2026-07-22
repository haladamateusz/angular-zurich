import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DashboardEventSortColumn,
  SupabaseService,
} from '../../core/data-access/supabase/supabase.service';
import { DashboardEvent } from '../../core/models/event.interface';
import { createPaginationItems } from './pagination';

const EVENTS_PAGE_SIZE = 5;
type SortColumn = 'date' | 'title' | 'visibility';
type SortDirection = 'asc' | 'desc';

@Component({
  selector: 'app-dashboard-events',
  imports: [DatePipe, NgTemplateOutlet, RouterLink],
  templateUrl: './dashboard-events.component.html',
  styleUrl: './dashboard-events.component.css',
})
export class DashboardEventsComponent {
  private readonly supabaseService = inject(SupabaseService);
  private latestLoadId = 0;

  protected readonly isLoading = signal(true);
  protected readonly errorMessage = signal('');
  protected readonly events = signal<DashboardEvent[]>([]);
  protected readonly totalEventCount = signal(0);
  protected readonly currentPage = signal(1);
  protected readonly sortColumn = signal<SortColumn>('date');
  protected readonly sortDirection = signal<SortDirection>('desc');
  protected readonly eventDetailsNavigationState = { fromDashboardEvents: true } as const;

  protected readonly hasEvents = computed(() => this.events().length > 0);
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

  private async loadEvents(): Promise<void> {
    const loadId = this.latestLoadId + 1;
    this.latestLoadId = loadId;
    this.isLoading.set(true);
    this.errorMessage.set('');

    const { count, data, error } = await this.supabaseService.getDashboardEvents({
      page: this.currentPage(),
      pageSize: EVENTS_PAGE_SIZE,
      sortColumn: this.getSortColumn(this.sortColumn()),
      sortDirection: this.sortDirection(),
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
    this.isLoading.set(false);
  }
}

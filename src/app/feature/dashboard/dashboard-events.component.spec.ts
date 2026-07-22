import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SupabaseService } from '../../core/data-access/supabase/supabase.service';
import { DashboardEventsComponent } from './dashboard-events.component';

const dashboardEvents = [
  {
    id: 'event-public',
    slug: 'angular-signals',
    title: 'Angular Signals',
    starts_at: '2026-09-10T18:00:00.000Z',
    public: true,
  },
  {
    id: 'event-draft',
    slug: 'angular-performance',
    title: 'Angular Performance',
    starts_at: '2026-10-08T18:00:00.000Z',
    public: false,
  },
];

describe('DashboardEventsComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DashboardEventsComponent],
      providers: [
        provideRouter([]),
        {
          provide: SupabaseService,
          useValue: {
            getDashboardEvents: vi.fn().mockResolvedValue({
              count: dashboardEvents.length,
              data: dashboardEvents,
              error: null,
            }),
          },
        },
      ],
    });
  });

  it('renders unified sortable headers with a visually hidden actions label', async () => {
    const fixture = TestBed.createComponent(DashboardEventsComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const sortButtons = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.dashboard-events-table__sort-button'),
    );
    const actionsHeader = element.querySelector<HTMLElement>(
      '.dashboard-events-table__heading--actions',
    );
    const visibilityBadges = Array.from(
      element.querySelectorAll<HTMLElement>('.dashboard-events-table__visibility'),
    );
    const titleLinks = Array.from(
      element.querySelectorAll<HTMLAnchorElement>('.dashboard-events-table__title-link'),
    );
    const editLinks = Array.from(
      element.querySelectorAll<HTMLAnchorElement>('.dashboard-events-table__edit-button'),
    );

    expect(sortButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Sort by Title',
      'Sort by Date',
      'Sort by Visibility',
    ]);
    expect(actionsHeader?.querySelector('.sr-only')?.textContent?.trim()).toBe('Actions');
    expect(visibilityBadges.map((badge) => badge.textContent?.trim())).toEqual(['Public', 'Draft']);
    expect(titleLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/events/angular-signals',
      '/events/angular-performance',
    ]);
    expect(visibilityBadges.every((badge) => badge.tagName === 'SPAN')).toBe(true);
    expect(visibilityBadges.every((badge) => !badge.classList.contains('app-button'))).toBe(true);
    expect(editLinks.map((link) => link.getAttribute('href'))).toEqual([
      '/dashboard/events/event-public',
      '/dashboard/events/event-draft',
    ]);
    expect(editLinks.every((link) => link.classList.contains('app-button--ghost'))).toBe(true);
  });

  it('sorts events by date descending initially and reloads when the sort changes', async () => {
    const supabaseService = TestBed.inject(SupabaseService);
    const fixture = TestBed.createComponent(DashboardEventsComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const titleSortButton = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.dashboard-events-table__sort-button'),
    ).find((button) => button.getAttribute('aria-label') === 'Sort by Title');
    const dateHeader = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.dashboard-events-table__sort-button'),
    )
      .find((button) => button.getAttribute('aria-label') === 'Sort by Date')
      ?.closest('th');
    const titleHeader = titleSortButton?.closest('th');

    expect(supabaseService.getDashboardEvents).toHaveBeenLastCalledWith({
      filters: {
        endDate: undefined,
        startDate: undefined,
        title: undefined,
        visibility: undefined,
      },
      page: 1,
      pageSize: 5,
      sortColumn: 'starts_at',
      sortDirection: 'desc',
    });
    expect(dateHeader?.getAttribute('aria-sort')).toBe('descending');
    expect(titleSortButton).toBeDefined();

    titleSortButton?.click();
    await fixture.whenStable();

    expect(supabaseService.getDashboardEvents).toHaveBeenLastCalledWith({
      filters: {
        endDate: undefined,
        startDate: undefined,
        title: undefined,
        visibility: undefined,
      },
      page: 1,
      pageSize: 5,
      sortColumn: 'title',
      sortDirection: 'asc',
    });
    expect(titleHeader?.getAttribute('aria-sort')).toBe('ascending');
  });

  it('filters events by title, date range, and visibility', async () => {
    const supabaseService = TestBed.inject(SupabaseService);
    const fixture = TestBed.createComponent(DashboardEventsComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const filterTriggers = Array.from(
      element.querySelectorAll<HTMLButtonElement>('.dashboard-table-filter__trigger'),
    );
    const component = fixture.componentInstance as unknown as {
      updateDateRange(value: { endDate: string; startDate: string }): void;
      updateVisibilityFilter(value: string): void;
    };

    expect(filterTriggers).toHaveLength(3);

    filterTriggers[0]!.click();
    fixture.detectChanges();

    const titleInput = element.querySelector<HTMLInputElement>('input[type="search"]');

    expect(titleInput).not.toBeNull();

    titleInput!.value = 'Signals';
    titleInput!.dispatchEvent(new Event('input'));

    await fixture.whenStable();

    const dateFilterTrigger = element.querySelectorAll<HTMLButtonElement>(
      '.dashboard-table-filter__trigger',
    )[1];

    dateFilterTrigger!.click();
    fixture.detectChanges();

    expect(element.querySelectorAll('app-create-event-date-picker')).toHaveLength(2);

    component.updateDateRange({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    component.updateVisibilityFilter('public');

    await fixture.whenStable();

    expect(supabaseService.getDashboardEvents).toHaveBeenLastCalledWith({
      filters: {
        endDate: '2026-09-30',
        startDate: '2026-09-01',
        title: 'Signals',
        visibility: 'public',
      },
      page: 1,
      pageSize: 5,
      sortColumn: 'starts_at',
      sortDirection: 'desc',
    });
  });

  it('keeps header controls visible when filters return no events', async () => {
    const supabaseService = TestBed.inject(SupabaseService);
    const fixture = TestBed.createComponent(DashboardEventsComponent);

    await fixture.whenStable();

    vi.mocked(supabaseService.getDashboardEvents).mockResolvedValue({
      count: 0,
      data: [],
      error: null,
      success: true,
      status: 200,
      statusText: 'OK',
    });

    const component = fixture.componentInstance as unknown as {
      updateVisibilityFilter(value: string): void;
    };

    component.updateVisibilityFilter('public');
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.dashboard-events-table')).not.toBeNull();
    expect(element.querySelectorAll('.dashboard-events-table__sort-button')).toHaveLength(3);
    expect(element.querySelectorAll('.dashboard-table-filter__trigger')).toHaveLength(3);
    expect(element.querySelector('.dashboard-data-table__empty')?.textContent?.trim()).toBe(
      'No matching events.',
    );
  });

  it('renders the current pagination page as non-interactive', async () => {
    const supabaseService = TestBed.inject(SupabaseService);

    vi.mocked(supabaseService.getDashboardEvents).mockResolvedValue({
      count: 12,
      data: dashboardEvents,
      error: null,
      success: true,
      status: 200,
      statusText: 'OK',
    });

    const fixture = TestBed.createComponent(DashboardEventsComponent);

    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    const currentPage = element.querySelector<HTMLElement>('.app-pagination-current');
    const pageButtons = Array.from(
      element.querySelectorAll<HTMLButtonElement>('button.dashboard-events-table__pagination-page'),
    );

    expect(currentPage?.tagName).toBe('SPAN');
    expect(currentPage?.getAttribute('aria-current')).toBe('page');
    expect(currentPage?.textContent?.trim()).toBe('1');
    expect(pageButtons.map((button) => button.textContent?.trim())).toEqual(['2', '3']);
  });
});

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

    expect(sortButtons.map((button) => button.textContent?.trim())).toEqual([
      'Title',
      'Date',
      'Visibility',
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
    ).find((button) => button.textContent?.trim() === 'Title');
    const dateHeader = Array.from(element.querySelectorAll<HTMLTableCellElement>('th')).find(
      (header) => header.textContent?.trim() === 'Date',
    );
    const titleHeader = Array.from(element.querySelectorAll<HTMLTableCellElement>('th')).find(
      (header) => header.textContent?.trim() === 'Title',
    );

    expect(supabaseService.getDashboardEvents).toHaveBeenLastCalledWith({
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
      page: 1,
      pageSize: 5,
      sortColumn: 'title',
      sortDirection: 'asc',
    });
    expect(titleHeader?.getAttribute('aria-sort')).toBe('ascending');
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

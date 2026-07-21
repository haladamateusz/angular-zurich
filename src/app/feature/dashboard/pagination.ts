const MAX_VISIBLE_ITEMS = 7;

export type PaginationItem =
  | {
      readonly type: 'page';
      readonly page: number;
      readonly key: string;
    }
  | {
      readonly type: 'ellipsis';
      readonly key: 'ellipsis-start' | 'ellipsis-end';
    };

export function createPaginationItems(
  currentPage: number,
  totalPages: number,
): readonly PaginationItem[] {
  const safeTotalPages = Math.max(1, Math.trunc(totalPages));
  const safeCurrentPage = Math.min(safeTotalPages, Math.max(1, Math.trunc(currentPage)));

  if (safeTotalPages <= MAX_VISIBLE_ITEMS) {
    return createPageRange(1, safeTotalPages);
  }

  if (safeCurrentPage <= 4) {
    return [
      ...createPageRange(1, 5),
      { type: 'ellipsis', key: 'ellipsis-end' },
      createPageItem(safeTotalPages),
    ];
  }

  if (safeCurrentPage >= safeTotalPages - 3) {
    return [
      createPageItem(1),
      { type: 'ellipsis', key: 'ellipsis-start' },
      ...createPageRange(safeTotalPages - 4, safeTotalPages),
    ];
  }

  return [
    createPageItem(1),
    { type: 'ellipsis', key: 'ellipsis-start' },
    ...createPageRange(safeCurrentPage - 1, safeCurrentPage + 1),
    { type: 'ellipsis', key: 'ellipsis-end' },
    createPageItem(safeTotalPages),
  ];
}

function createPageRange(start: number, end: number): readonly PaginationItem[] {
  return Array.from({ length: end - start + 1 }, (_, index) => createPageItem(start + index));
}

function createPageItem(page: number): PaginationItem {
  return { type: 'page', page, key: `page-${page}` };
}

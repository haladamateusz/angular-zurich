import { describe, expect, it } from 'vitest';
import { createPaginationItems, PaginationItem } from './pagination';

function summarize(items: readonly PaginationItem[]): readonly (number | string)[] {
  return items.map((item) => (item.type === 'page' ? item.page : item.key));
}

describe('createPaginationItems', () => {
  it('shows every page when the total fits in the visible window', () => {
    expect(summarize(createPaginationItems(4, 7))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('collapses pages after the opening window', () => {
    expect(summarize(createPaginationItems(1, 10))).toEqual([1, 2, 3, 4, 5, 'ellipsis-end', 10]);
  });

  it('keeps a centered window around the current page', () => {
    expect(summarize(createPaginationItems(5, 10))).toEqual([
      1,
      'ellipsis-start',
      4,
      5,
      6,
      'ellipsis-end',
      10,
    ]);
  });

  it('collapses pages before the closing window', () => {
    expect(summarize(createPaginationItems(10, 10))).toEqual([1, 'ellipsis-start', 6, 7, 8, 9, 10]);
  });
});

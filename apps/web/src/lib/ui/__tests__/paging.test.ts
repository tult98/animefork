import { describe, expect, it } from 'vitest';
import { paginate, pageWindow } from '../paging.ts';

const list = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('paginate', () => {
  it('slices a page of thirty', () => {
    const paged = paginate(list(63), 2);
    expect(paged.items).toEqual(list(60).slice(30));
    expect(paged).toMatchObject({ page: 2, pageCount: 3 });
  });
  it('gives the short last page', () => {
    expect(paginate(list(63), 3).items).toHaveLength(3);
  });
  it('clamps a page past the end or below one', () => {
    expect(paginate(list(63), 99).page).toBe(3);
    expect(paginate(list(63), 0).page).toBe(1);
    expect(paginate(list(63), Number.NaN).page).toBe(1);
  });
  it('has one empty page for an empty list', () => {
    expect(paginate([], 4)).toEqual({ items: [], page: 1, pageCount: 1 });
  });
  it('is one page at thirty or fewer', () => {
    expect(paginate(list(30), 1).pageCount).toBe(1);
    expect(paginate(list(31), 1).pageCount).toBe(2);
  });
});

describe('pageWindow', () => {
  it('shows every page up to seven', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('collapses the far end', () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, 'gap', 10]);
    expect(pageWindow(2, 10)).toEqual([1, 2, 3, 'gap', 10]);
  });
  it('collapses both sides around the middle', () => {
    expect(pageWindow(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
  });
  it('collapses the near end', () => {
    expect(pageWindow(10, 10)).toEqual([1, 'gap', 9, 10]);
    expect(pageWindow(9, 10)).toEqual([1, 'gap', 8, 9, 10]);
  });
  it('fills a gap of a single page instead of an ellipsis', () => {
    expect(pageWindow(4, 10)).toEqual([1, 2, 3, 4, 5, 'gap', 10]);
  });
});

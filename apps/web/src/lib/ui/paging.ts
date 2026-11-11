export const PAGE_SIZE = 30;
const MAX_PLAIN_PAGES = 7;

export interface Paged<T> {
  items: T[];
  page: number;
  pageCount: number;
}

export function paginate<T>(
  items: readonly T[],
  page: number,
  size: number = PAGE_SIZE,
): Paged<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const clamped = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  return {
    items: items.slice((clamped - 1) * size, clamped * size),
    page: clamped,
    pageCount,
  };
}

export type PageSlot = number | 'gap';

export function pageWindow(page: number, pageCount: number): PageSlot[] {
  if (pageCount <= MAX_PLAIN_PAGES) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const wanted = new Set(
    [1, page - 1, page, page + 1, pageCount].filter(
      (n) => n >= 1 && n <= pageCount,
    ),
  );
  const slots: PageSlot[] = [];
  let previous = 0;
  for (const n of [...wanted].sort((a, b) => a - b)) {
    if (n - previous === 2) slots.push(previous + 1);
    else if (n - previous > 2) slots.push('gap');
    slots.push(n);
    previous = n;
  }
  return slots;
}

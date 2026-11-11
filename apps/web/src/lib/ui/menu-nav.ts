export type MenuNavKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export function nextMenuIndex(
  current: number,
  count: number,
  key: MenuNavKey,
): number {
  if (count <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (current < 0) return key === 'ArrowDown' ? 0 : count - 1;
  const step = key === 'ArrowDown' ? 1 : -1;
  return (current + step + count) % count;
}

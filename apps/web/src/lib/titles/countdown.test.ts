import { describe, expect, it } from 'vitest';
import { formatCountdown } from './countdown.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 11, 12);
const in_ = (ms: number) => formatCountdown(NOW + ms, NOW);

describe('formatCountdown', () => {
  it.each([
    ['now', 0, 'Hôm nay'],
    ['a minute short of a day', DAY - 60_000, 'Hôm nay'],
    ['exactly 1 day', DAY, 'Còn 1 ngày'],
    ['6 days and change', 6 * DAY + DAY / 2, 'Còn 6 ngày'],
    ['exactly 7 days', 7 * DAY, 'Còn 1 tuần'],
    ['13 days', 13 * DAY, 'Còn 1 tuần'],
    ['14 days', 14 * DAY, 'Còn 2 tuần'],
    ['29 days', 29 * DAY, 'Còn 4 tuần'],
    ['exactly 30 days', 30 * DAY, 'Còn 1 tháng'],
    ['59 days', 59 * DAY, 'Còn 1 tháng'],
    ['60 days', 60 * DAY, 'Còn 2 tháng'],
    ['364 days', 364 * DAY, 'Còn 12 tháng'],
  ])('%s', (_, ms, expected) => {
    expect(in_(ms)).toBe(expected);
  });

  it('shows the release year from 365 days out', () => {
    const at = NOW + 365 * DAY;
    expect(formatCountdown(at, NOW)).toBe(String(new Date(at).getFullYear()));
    expect(formatCountdown(Date.UTC(2030, 5, 1), NOW)).toBe('2030');
  });
});

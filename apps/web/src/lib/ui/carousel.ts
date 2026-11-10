import type { Title } from '../titles/title.ts';

export const HERO_ADVANCE_MS = 7000;

export function nextIndex(index: number, length: number): number {
  return length <= 0 ? 0 : (index + 1) % length;
}

export function prevIndex(index: number, length: number): number {
  return length <= 0 ? 0 : (index - 1 + length) % length;
}

export function counterLabel(index: number, length: number): string {
  return `${index + 1} trên ${length}`;
}

export function heroMeta(
  title: Pick<Title, 'genres' | 'year' | 'rating'>,
): string {
  return [
    'TV',
    title.genres[0],
    title.year === undefined ? undefined : String(title.year),
    `${title.rating.toFixed(1)}/10`,
  ]
    .filter(Boolean)
    .join(' · ');
}

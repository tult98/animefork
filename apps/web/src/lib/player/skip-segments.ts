import type { SkipSegment } from '../../../../api/src/skip-times/contract.ts';

export type { SkipSegment };

export function activeSegment(
  segments: readonly SkipSegment[],
  time: number,
): SkipSegment | undefined {
  return segments.find((s) => s.startS <= time && time < s.endS);
}

export function episodeNumber(label: string): number | undefined {
  const match = /^Tập (\d{1,4})$/.exec(label);
  const number = match ? Number(match[1]) : 0;
  return number > 0 ? number : undefined;
}

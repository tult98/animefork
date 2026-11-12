import type { SkipSegment } from '../../../../api/src/skip-times/contract.ts';

export type { SkipSegment };

export function activeSegment(
  segments: readonly SkipSegment[],
  time: number,
): SkipSegment | undefined {
  return segments.find((s) => s.startS <= time && time < s.endS);
}

// AniSkip is keyed by episode number, so only a plain "Tập 12" label has one. A special or a combined label does not, and is not guessed.
export function episodeNumber(label: string): number | undefined {
  const match = /^Tập (\d{1,4})$/.exec(label);
  const number = match ? Number(match[1]) : 0;
  return number > 0 ? number : undefined;
}

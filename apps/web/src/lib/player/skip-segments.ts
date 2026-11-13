import { PLAYER_COPY } from './copy.ts';
import { formatClock, percent } from './format.ts';
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

// Where the timeline is notched: the edges of an intro, and the start of an outro (it runs to the end).
export function segmentTicks(
  segments: readonly SkipSegment[],
  duration: number,
): number[] {
  const seconds = segments.flatMap((s) =>
    s.kind === 'intro' ? [s.startS, s.endS] : [s.startS],
  );
  return seconds
    .map((s) => percent(s, duration))
    .filter((pct) => pct > 0 && pct < 100);
}

export function scrubCaption(
  segments: readonly SkipSegment[],
  seconds: number,
): string {
  const kind = activeSegment(segments, seconds)?.kind;
  const clock = formatClock(seconds);
  if (kind === 'intro') return `${clock} · ${PLAYER_COPY.introLabel}`;
  if (kind === 'outro') return `${clock} · ${PLAYER_COPY.outroLabel}`;
  return clock;
}

import type { WatchProgressEpisode } from '../../../../api/src/watch-progress/contract.ts';

export type EpisodeProgress =
  | { kind: 'unwatched' }
  | { kind: 'inProgress'; fraction: number }
  | { kind: 'watched' };

export const UNWATCHED: EpisodeProgress = { kind: 'unwatched' };

export function progressOf(
  row: WatchProgressEpisode | undefined,
): EpisodeProgress {
  if (!row) return UNWATCHED;
  if (row.completed) return { kind: 'watched' };
  const fraction =
    row.durationS > 0
      ? Math.min(1, Math.max(0, row.positionS / row.durationS))
      : 0;
  // A row saved at the very start carries no progress to show.
  return fraction > 0 ? { kind: 'inProgress', fraction } : UNWATCHED;
}

export function progressByEpisode(
  rows: WatchProgressEpisode[],
): Map<string, EpisodeProgress> {
  return new Map(rows.map((row) => [row.episodeId, progressOf(row)]));
}

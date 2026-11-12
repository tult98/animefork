import type { WatchProgressEpisode } from '../../../../api/src/watch-progress/contract.ts';

export interface ResumePoint {
  episodeId: string;
  positionS: number;
}

// Rewinding a few seconds gives the viewer back the sentence they were in the middle of.
const REWIND_S = 5;

export function seekTarget(positionS: number): number {
  return Math.max(0, positionS - REWIND_S);
}

// A completed row restarts from zero: resuming at the credits would just end the episode again.
export function startPosition(
  episodeId: string,
  rows: WatchProgressEpisode[],
): number {
  const row = rows.find((r) => r.episodeId === episodeId);
  return row && !row.completed ? row.positionS : 0;
}

// Rows for episodes that are not on this page (another season, a removed episode) are ignored.
export function resumePoint(
  episodes: { id: string }[],
  rows: WatchProgressEpisode[],
): ResumePoint | undefined {
  const first = episodes[0];
  if (!first) return undefined;
  const byEpisode = new Map(rows.map((row) => [row.episodeId, row]));
  for (let index = episodes.length - 1; index >= 0; index--) {
    const row = byEpisode.get(episodes[index]?.id ?? '');
    if (!row) continue;
    if (!row.completed) {
      return { episodeId: row.episodeId, positionS: row.positionS };
    }
    return { episodeId: (episodes[index + 1] ?? first).id, positionS: 0 };
  }
  return { episodeId: first.id, positionS: 0 };
}

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
): ResumePoint {
  const byEpisode = new Map(rows.map((row) => [row.episodeId, row]));
  let last = -1;
  episodes.forEach((episode, index) => {
    if (byEpisode.has(episode.id)) last = index;
  });
  const row = last >= 0 ? byEpisode.get(episodes[last].id) : undefined;
  if (!row) return { episodeId: episodes[0].id, positionS: 0 };
  if (!row.completed) {
    return { episodeId: row.episodeId, positionS: row.positionS };
  }
  const next = episodes[last + 1] ?? episodes[0];
  return { episodeId: next.id, positionS: 0 };
}

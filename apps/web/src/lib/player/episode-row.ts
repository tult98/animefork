import { PLAYER_COPY } from './copy.ts';

export interface EpisodeRowText {
  // Set when the episode has a name: "Tập 3 · Đang phát" above the name.
  meta?: string;
  title: string;
  // Set when it has no name, so the status sits under the label that is the title.
  below?: string;
}

export function episodeRowText(
  episode: { label: string; name?: string },
  status: 'current' | 'watched' | undefined,
): EpisodeRowText {
  const word =
    status === 'current'
      ? PLAYER_COPY.nowPlaying
      : status === 'watched'
        ? PLAYER_COPY.watched
        : undefined;
  if (!episode.name) return { title: episode.label, below: word };
  return {
    meta: [episode.label, word].filter(Boolean).join(' · '),
    title: episode.name,
  };
}

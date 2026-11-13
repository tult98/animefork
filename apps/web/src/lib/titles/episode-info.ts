import type { EpisodesResponse } from '../../../../api/src/art/contract.ts';
import type { WatchPage } from './watch.ts';

function episodeNumber(label: string): number | undefined {
  const match = /^Tập (\d+)(?![\d.])/.exec(label);
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined;
}

// The source page's own name wins. Otherwise the Vietnamese title, or MAL's English one until it is translated.
export function applyEpisodeInfo(
  page: WatchPage,
  info: EpisodesResponse,
): WatchPage {
  if (info.status !== 'ready') return page;
  const names = new Map(
    info.episodes.flatMap((e) => {
      const name = e.titleVi ?? e.title;
      return name ? [[e.number, name] as const] : [];
    }),
  );
  const named = (episode: WatchPage['episodes'][number]) => {
    const number = episodeNumber(episode.label);
    const name = number === undefined ? undefined : names.get(number);
    return !episode.name && name ? { ...episode, name } : episode;
  };
  const episodes = page.episodes.map(named);
  return {
    ...page,
    episodes,
    currentEpisode:
      episodes.find((e) => e.id === page.currentEpisode.id) ??
      page.currentEpisode,
  };
}

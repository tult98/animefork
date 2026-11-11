import type { Title } from './title.ts';

// An airing show reads "Tập 6/12" once MAL knows its total; with no total, or off air, the card's own label stands.
export function episodeProgress(title: Pick<Title, 'episodeLabel' | 'mal'>) {
  const { episodeLabel, mal } = title;
  if (mal?.airing !== 'currently_airing' || mal.episodes === null) {
    return episodeLabel;
  }
  const current = /^Tập (\d+)$/.exec(episodeLabel)?.[1];
  if (current === undefined || Number(current) > mal.episodes) {
    return episodeLabel;
  }
  return `${episodeLabel}/${mal.episodes}`;
}

import type { Title } from './title.ts';

const TITLE_PREFIX = '/phim/';

export function titleLink(title: Pick<Title, 'path'>) {
  return {
    to: '/phim/$',
    params: {
      _splat: title.path.startsWith(TITLE_PREFIX)
        ? title.path.slice(TITLE_PREFIX.length)
        : title.path,
    },
  } as const;
}

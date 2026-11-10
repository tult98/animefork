import type { Title } from './title.ts';

const UPSTREAM_TITLE_PREFIX = '/phim/';

export function titleLink(title: Pick<Title, 'path'>) {
  return {
    to: '/title/$',
    params: {
      _splat: title.path.startsWith(UPSTREAM_TITLE_PREFIX)
        ? title.path.slice(UPSTREAM_TITLE_PREFIX.length)
        : title.path,
    },
  } as const;
}

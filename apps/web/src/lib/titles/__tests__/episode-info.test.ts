import { describe, expect, it } from 'vitest';
import { applyEpisodeInfo } from '../episode-info.ts';
import type { WatchPage } from '../watch.ts';

const episode = (n: number) => ({
  id: String(n),
  hash: 'h',
  play: 'p',
  label: `Tập ${n}`,
});

const page = {
  episodes: [episode(1), episode(2)],
  currentEpisode: episode(1),
} as unknown as WatchPage;

describe('applyEpisodeInfo', () => {
  it('gives each episode its Vietnamese synopsis, or the English one until it is translated', () => {
    const out = applyEpisodeInfo(page, [
      {
        number: 1,
        title: 'The Boy',
        titleVi: null,
        aired: null,
        synopsis: 'A boy wakes.',
        synopsisVi: 'Một cậu bé thức dậy.',
      },
      {
        number: 2,
        title: 'The Door',
        titleVi: null,
        aired: null,
        synopsis: 'He opens it.',
        synopsisVi: null,
      },
    ]);

    expect(out.episodes.map((e) => e.synopsis)).toEqual([
      'Một cậu bé thức dậy.',
      'He opens it.',
    ]);
    expect(out.currentEpisode.synopsis).toBe('Một cậu bé thức dậy.');
  });
});

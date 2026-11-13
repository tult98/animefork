// @vitest-environment jsdom
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Title } from '../../lib/titles/title.ts';
import { render, screen, within } from '../../test/test-utils.tsx';
import { PosterCard } from '../poster-card.tsx';

const title = (trailerYoutubeId: string | null): Title => ({
  path: 'alpha-a1',
  name: 'Phim alpha',
  image: 'https://img.test/alpha.jpg',
  rating: 8,
  episodeLabel: 'Tập 1',
  genres: [],
  mal: {
    id: 1,
    score: null,
    voters: null,
    rank: null,
    popularity: null,
    members: null,
    airing: null,
    episodes: null,
    startDate: null,
    startSeason: null,
    trailerYoutubeId,
  },
});

async function openPopover(t: Title) {
  render(<PosterCard title={t} />, { path: '/' });
  await userEvent.hover(await screen.findByTestId('card:alpha-a1'));
  return screen.findByTestId('card:alpha-a1:preview');
}

describe('the promo video in the card popover', () => {
  it('plays the muted looping trailer over the backdrop when the title has one', async () => {
    const preview = await openPopover(title('abc123'));
    const video = within(preview).getByTestId('card:promo-video');
    const src = new URL(video.getAttribute('src')!);
    expect(src.origin + src.pathname).toBe(
      'https://www.youtube-nocookie.com/embed/abc123',
    );
    expect(Object.fromEntries(src.searchParams)).toMatchObject({
      autoplay: '1',
      mute: '1',
      loop: '1',
      playlist: 'abc123',
    });
    expect(preview.querySelector('img')).toBeInTheDocument();
  });

  it('keeps the image alone when the title has no trailer', async () => {
    const preview = await openPopover(title(null));
    expect(within(preview).queryByTestId('card:promo-video')).toBeNull();
    expect(preview.querySelector('img')).toBeInTheDocument();
  });

  it('does not play it for a visitor who prefers reduced motion', async () => {
    const real = window.matchMedia;
    window.matchMedia = (query) =>
      ({
        ...real(query),
        matches: query.includes('prefers-reduced-motion'),
      }) as MediaQueryList;
    try {
      const preview = await openPopover(title('abc123'));
      expect(within(preview).queryByTestId('card:promo-video')).toBeNull();
    } finally {
      window.matchMedia = real;
    }
  });
});

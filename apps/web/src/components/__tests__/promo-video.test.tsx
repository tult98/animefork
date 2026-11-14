// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Title } from '../../lib/titles/title.ts';
import { render, screen, within } from '../../test/test-utils.tsx';
import { stubYouTube } from '../../test/youtube-stub.ts';
import { mockWatchHtml } from '../../lib/titles/__mockData__/index.ts';
import { watchLink } from '../../lib/titles/link.ts';
import { ContinueCard } from '../continue-card.tsx';
import { PosterCard } from '../poster-card.tsx';
import { Trailer } from '../trailer.tsx';

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
  it('plays the muted trailer over the backdrop and starts it again when it ends', async () => {
    const players = stubYouTube();
    const preview = await openPopover(title('abc123'));
    const player = await vi.waitUntil(() => players[0]);
    expect(player.videoId).toBe('abc123');
    expect(player.options.playerVars).toMatchObject({ autoplay: 1, mute: 1 });
    const video = within(preview).getByTestId('card:promo-video');
    expect(video).toHaveAttribute('data-phase', 'loading');

    player.play();
    expect(video).toHaveAttribute('data-phase', 'playing');
    player.end();
    expect(player.seekTo).toHaveBeenCalledWith(0, true);
    expect(player.playVideo).toHaveBeenCalled();
    expect(video).toHaveAttribute('data-phase', 'playing');
    expect(preview.querySelector('img')).toBeInTheDocument();
  });

  it('plays the trailer of a continue watching title in its popover', async () => {
    const players = stubYouTube();
    render(
      <ContinueCard
        item={{
          slug: 'alpha',
          titleName: 'Phim alpha',
          image: 'https://img.test/alpha.jpg',
          episodeLabel: 'Tập 7',
          episodeId: '7',
          state: { kind: 'finished' },
          link: watchLink('alpha'),
          mal: title('abc123').mal,
        }}
      />,
      { path: '/' },
    );
    await userEvent.hover(await screen.findByTestId('card:continue:alpha'));
    const preview = await screen.findByTestId('card:continue:alpha:preview');
    const player = await vi.waitUntil(() => players[0]);
    expect(player.videoId).toBe('abc123');
    expect(player.mute).toHaveBeenCalled();

    player.play();
    expect(within(preview).getByTestId('card:promo-video')).toHaveAttribute(
      'data-phase',
      'playing',
    );
    expect(preview.querySelector('img')).toBeInTheDocument();
  });

  it('plays the trailer of a continue watching title in the details opened from its popover', async () => {
    const players = stubYouTube();
    fetchMock.get('path:/phim/alpha-a1/xem-phim.html', mockWatchHtml);
    render(
      <ContinueCard
        item={{
          slug: 'alpha-a1',
          titleName: 'Phim alpha',
          image: 'https://img.test/alpha.jpg',
          episodeLabel: 'Tập 7',
          episodeId: '7',
          state: { kind: 'finished' },
          link: watchLink('alpha-a1'),
          mal: title('abc123').mal,
        }}
      />,
      { path: '/' },
    );
    await userEvent.hover(await screen.findByTestId('card:continue:alpha-a1'));
    await userEvent.click(
      await screen.findByTestId('card:continue:alpha-a1:details'),
    );
    await expect(fetchMock).toBeFetched('path:/phim/alpha-a1/xem-phim.html');

    const details = screen.getByTestId('details');
    expect(within(details).getByTestId('trailer')).toBeInTheDocument();
    expect(players.at(-1)?.videoId).toBe('abc123');
  });

  it('turns the sound on for every trailer from the popover, the ones that start later included', async () => {
    const players = stubYouTube();
    render(<PosterCard title={title('abc123')} />, { path: '/' });
    await userEvent.hover(await screen.findByTestId('card:alpha-a1'));
    const preview = await screen.findByTestId('card:alpha-a1:preview');
    const card = await vi.waitUntil(() => players[0]);
    expect(
      within(preview).queryByTestId('card:promo-video:sound'),
    ).not.toBeInTheDocument();

    card.play();
    const sound = within(preview).getByTestId('card:promo-video:sound');
    expect(sound).toHaveAccessibleName('Bật tiếng');
    await userEvent.click(sound);
    expect(card.unMute).toHaveBeenCalled();
    expect(sound).toHaveAccessibleName('Tắt tiếng');
    expect(screen.queryByTestId('details')).not.toBeInTheDocument();

    render(<Trailer youtubeId="later" />);
    const later = await vi.waitUntil(() => players[1]);
    expect(later.unMute).toHaveBeenCalled();
    expect(later.mute).not.toHaveBeenCalled();
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

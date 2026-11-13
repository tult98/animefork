// @vitest-environment jsdom
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Title } from '../../lib/titles/title.ts';
import { render, screen } from '../../test/test-utils.tsx';
import { stubYouTube } from '../../test/youtube-stub.ts';
import { DetailsModal } from '../details/details-modal.tsx';

const title = (trailerYoutubeId: string | null): Title => ({
  path: '/phim/alpha-a1/',
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

describe('the trailer in the details modal', () => {
  it('plays muted over the header art, with a toggle that turns its sound on and off', async () => {
    const players = stubYouTube();
    render(
      <DetailsModal title={title('abc123')} upcoming onClose={() => {}} />,
      {
        path: '/',
      },
    );
    const player = await vi.waitUntil(() => players[0]);
    expect(player.videoId).toBe('abc123');
    expect(screen.getByTestId('details').querySelector('img')).toHaveAttribute(
      'src',
      'https://img.test/alpha.jpg',
    );
    expect(screen.queryByTestId('details:mute')).not.toBeInTheDocument();

    player.play();
    const toggle = screen.getByTestId('details:mute');
    expect(toggle).toHaveAccessibleName('Bật tiếng');
    await userEvent.click(toggle);
    expect(player.unMute).toHaveBeenCalled();
    expect(toggle).toHaveAccessibleName('Tắt tiếng');
    await userEvent.click(toggle);
    expect(player.mute).toHaveBeenCalled();

    player.end();
    expect(screen.queryByTestId('details:mute')).not.toBeInTheDocument();
  });

  it('keeps the still art alone when the title has no trailer', async () => {
    const players = stubYouTube();
    render(<DetailsModal title={title(null)} upcoming onClose={() => {}} />, {
      path: '/',
    });
    await screen.findByTestId('details');
    expect(screen.queryByTestId('trailer')).not.toBeInTheDocument();
    expect(players).toHaveLength(0);
  });
});

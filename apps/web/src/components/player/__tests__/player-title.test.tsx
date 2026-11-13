// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../../test/test-utils.tsx';
import { Player } from '../player.tsx';

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test');
  fetchMock
    .get('path:/v1/auth/me', 401)
    .get('begin:https://api.test/v1/skip-times/', { segments: [] });
});

function renderPlayer(props: { seasonName?: string; name?: string }) {
  render(
    <Player
      slug="black-clover"
      seasonSlug="black-clover"
      title="Black Clover"
      seasonName={props.seasonName}
      episode={{
        id: '1',
        hash: 'h',
        play: 'api',
        label: 'Tập 3',
        name: props.name,
      }}
      startS={0}
      onBack={() => {}}
      episodesPanel={() => null}
    />,
  );
}

describe('the title block at the top of the player', () => {
  it('names the season, the episode number and the episode name under the series title', () => {
    renderPlayer({ seasonName: 'Phần 2', name: 'Hộ vệ bóng tối' });

    expect(screen.getByTestId('player:title')).toHaveTextContent(
      'Black Clover',
    );
    expect(screen.getByTestId('player:title').nextSibling).toHaveTextContent(
      'Phần 2 · Tập 3: Hộ vệ bóng tối',
    );
  });

  it('leaves out the season and the name when the title has neither', () => {
    renderPlayer({});

    expect(screen.getByTestId('player:title').nextSibling).toHaveTextContent(
      /^Tập 3$/,
    );
  });
});

describe('the next-episode popover', () => {
  it('names the next episode and plays it when the card is clicked', async () => {
    const onNext = vi.fn();
    render(
      <Player
        slug="black-clover"
        seasonSlug="black-clover"
        title="Black Clover"
        episode={{ id: '1', hash: 'h', play: 'api', label: 'Tập 3' }}
        nextEpisode={{
          episode: {
            id: '2',
            hash: 'h',
            play: 'api',
            label: 'Tập 4',
            name: 'Ngày Chuộc Tội',
          },
          number: 4,
        }}
        onNext={onNext}
        startS={0}
        onBack={() => {}}
        episodesPanel={() => null}
      />,
    );

    const card = screen.getByTestId('player:next-card');
    expect(card).toHaveTextContent('Tập tiếp theo');
    expect(card).toHaveTextContent('Tập 4: Ngày Chuộc Tội');

    await userEvent.click(card.querySelector('button')!);
    expect(onNext).toHaveBeenCalledOnce();
  });
});

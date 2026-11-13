// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '../../test/test-utils.tsx';
import { stubYouTube } from '../../test/youtube-stub.ts';
import { Trailer } from '../trailer.tsx';

describe('the trailer', () => {
  it('plays the muted trailer once over the image, then hands the box back to the image', async () => {
    const players = stubYouTube();
    const onPhase = vi.fn();
    const { unmount } = render(
      <Trailer youtubeId="abc123" onPhase={onPhase} />,
    );
    const player = await vi.waitUntil(() => players[0]);
    expect(player.videoId).toBe('abc123');
    expect(player.options.host).toBe('https://www.youtube-nocookie.com');
    expect(player.options.playerVars).toMatchObject({
      autoplay: 1,
      mute: 1,
      controls: 0,
    });
    expect(player.options.playerVars).not.toHaveProperty('loop');
    const trailer = screen.getByTestId('trailer');
    expect(trailer).toHaveAttribute('data-phase', 'loading');

    player.play();
    expect(trailer).toHaveAttribute('data-phase', 'playing');
    player.end();
    expect(trailer).toHaveAttribute('data-phase', 'ended');
    expect(onPhase.mock.calls.map(([phase]) => phase)).toEqual([
      'loading',
      'playing',
      'ended',
    ]);

    unmount();
    expect(player.destroy).toHaveBeenCalled();
  });

  it('shows the image again when the video cannot be embedded', async () => {
    const players = stubYouTube();
    render(<Trailer youtubeId="blocked" />);
    const player = await vi.waitUntil(() => players[0]);

    player.fail();
    expect(screen.getByTestId('trailer')).toHaveAttribute(
      'data-phase',
      'ended',
    );
  });
});

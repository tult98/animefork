// @vitest-environment jsdom
import { fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '../../../test/test-utils.tsx';
import { Scrubber } from '../scrubber.tsx';

const segments = [
  { kind: 'intro', startS: 30, endS: 120 },
  { kind: 'outro', startS: 1300, endS: 1400 },
] as const;

function hoverAt(clientX: number) {
  const scrub = screen.getByTestId('player:seek').parentElement!;
  // jsdom lays nothing out, so the 1000px wide timeline is given by hand.
  scrub.getBoundingClientRect = () => ({ left: 0, width: 1000 }) as DOMRect;
  // jsdom has no PointerEvent, so a mouse event carries the coordinates.
  fireEvent(scrub, new MouseEvent('pointermove', { clientX, bubbles: true }));
  return scrub;
}

describe('the timeline of the player', () => {
  it('notches the intro and the outro and names them under the pointer', () => {
    render(
      <Scrubber
        time={0}
        duration={1400}
        segments={segments}
        onSeek={() => {}}
      />,
    );
    expect(screen.getAllByTestId('player:tick')).toHaveLength(3);
    expect(
      screen.queryByTestId('player:scrub-caption'),
    ).not.toBeInTheDocument();

    const scrub = hoverAt(50);
    expect(screen.getByTestId('player:scrub-caption')).toHaveTextContent(
      '1:10 · Mở đầu',
    );

    hoverAt(500);
    expect(screen.getByTestId('player:scrub-caption')).toHaveTextContent(
      /^11:40$/,
    );

    hoverAt(950);
    expect(screen.getByTestId('player:scrub-caption')).toHaveTextContent(
      '22:10 · Kết thúc',
    );

    fireEvent(scrub, new MouseEvent('pointerout', { bubbles: true }));
    expect(
      screen.queryByTestId('player:scrub-caption'),
    ).not.toBeInTheDocument();
  });
});

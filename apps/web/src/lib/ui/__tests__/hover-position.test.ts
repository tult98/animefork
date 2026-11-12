import { describe, expect, it } from 'vitest';
import { hoverPosition } from '../hover-position.ts';

const viewport = { width: 1440, height: 900 };

describe('hoverPosition', () => {
  it('centers the preview on the cover and lifts it above the cover', () => {
    expect(
      hoverPosition({ left: 600, top: 300, width: 200 }, viewport),
    ).toEqual({
      left: 530,
      top: 268,
    });
  });

  it('keeps the left edge 8px inside the viewport', () => {
    expect(
      hoverPosition({ left: 0, top: 300, width: 100 }, viewport).left,
    ).toBe(8);
  });

  it('keeps the right edge 8px inside the viewport', () => {
    expect(
      hoverPosition({ left: 1400, top: 300, width: 100 }, viewport).left,
    ).toBe(1440 - 340 - 8);
  });

  it('never rises above the top edge', () => {
    expect(
      hoverPosition({ left: 600, top: 10, width: 200 }, viewport).top,
    ).toBe(8);
  });

  it('moves up when the measured height would run off the bottom', () => {
    expect(
      hoverPosition({ left: 600, top: 700, width: 200 }, viewport, 400).top,
    ).toBe(900 - 400 - 8);
  });

  it('prefers the top margin when the preview is taller than the viewport', () => {
    expect(
      hoverPosition({ left: 600, top: 700, width: 200 }, viewport, 2000).top,
    ).toBe(8);
  });

  it('rounds to whole pixels', () => {
    expect(
      hoverPosition({ left: 600.4, top: 300.6, width: 200 }, viewport),
    ).toEqual({
      left: 530,
      top: 269,
    });
  });
});

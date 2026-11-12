// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HERO_ADVANCE_MS } from '../../lib/ui/carousel.ts';
import { renderApp } from '../../test/render-app.tsx';

const counter = () => screen.getByTestId('hero:counter').textContent;
const active = () =>
  [...document.querySelectorAll('[data-testid^="hero:slide:"]')].flatMap(
    (slide, index) => (slide.hasAttribute('data-active') ? [index] : []),
  );

async function openHero() {
  await renderApp('/');
  return screen.findByTestId('hero');
}

// Autoplay is a plain setTimeout, so fake only the timers and click with fireEvent so no wait needs the clock.
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
const click = (id: string) =>
  act(() => void fireEvent.click(screen.getByTestId(id)));

async function openWithTimers() {
  const hero = await openHero();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  // Moving the slide re-arms the autoplay timer, now on the fake clock.
  click('hero:next');
  click('hero:prev');
  expect(counter()).toBe('1 trên 10');
  return hero;
}

describe('the hero', () => {
  afterEach(() => vi.useRealTimers());

  it('has 10 slides and marks exactly one active', async () => {
    const hero = await openHero();
    expect(hero.querySelectorAll('[data-testid^="hero:slide:"]')).toHaveLength(
      10,
    );
    expect(active()).toEqual([0]);
    expect(counter()).toBe('1 trên 10');
  });

  it('wraps around with previous and next', async () => {
    await openHero();
    await userEvent.click(screen.getByTestId('hero:prev'));
    expect(counter()).toBe('10 trên 10');
    expect(active()).toEqual([9]);
    await userEvent.click(screen.getByTestId('hero:next'));
    expect(counter()).toBe('1 trên 10');
  });

  it('shows the name, the meta line, the description and a Play link on a slide', async () => {
    await openHero();
    const slide = screen.getByTestId('hero:slide:0');
    expect(within(slide).getByRole('heading').textContent).not.toBe('');
    expect(slide.textContent).toMatch(/TV · .*\/10/);
    expect(slide.textContent).not.toMatch(/\d\d\/(\d\d|\?\?)/);
    expect(
      within(slide).getByRole('link', { name: 'Phát' }).getAttribute('href'),
    ).toMatch(/^\/watch\//);
    expect(within(slide).getByTestId('hero:info')).toBeTruthy();
  });

  it('keeps the whole name reachable through the title attribute', async () => {
    await openHero();
    const title = within(screen.getByTestId('hero:slide:0')).getByTestId(
      'hero:title',
    );
    expect(title.getAttribute('title')).toBe(title.textContent);
  });

  it('only lets the active slide take focus on its actions', async () => {
    await openHero();
    const link = (slide: number) =>
      within(screen.getByTestId(`hero:slide:${slide}`)).getByRole('link', {
        name: 'Phát',
      });
    expect(link(0).getAttribute('tabindex')).toBeNull();
    expect(link(1).getAttribute('tabindex')).toBe('-1');
  });

  it('opens the details modal for the slide from the info button', async () => {
    await openHero();
    const slide = screen.getByTestId('hero:slide:0');
    const name = within(slide).getByRole('heading').textContent;
    await userEvent.click(within(slide).getByTestId('hero:info'));
    const modal = await screen.findByTestId('details');
    expect(within(modal).getByRole('heading', { level: 2 }).textContent).toBe(
      name,
    );
    await userEvent.click(within(modal).getByTestId('details:close'));
    expect(screen.queryByTestId('details')).toBeNull();
  });

  describe('autoplay', () => {
    it('advances once every 7 seconds', async () => {
      await openWithTimers();
      advance(HERO_ADVANCE_MS - 100);
      expect(counter()).toBe('1 trên 10');
      advance(200);
      expect(counter()).toBe('2 trên 10');
      expect(active()).toEqual([1]);
      advance(HERO_ADVANCE_MS);
      expect(counter()).toBe('3 trên 10');
    });

    it('stops on pause and resumes on play', async () => {
      await openWithTimers();
      click('hero:pause');
      advance(30_000);
      expect(counter()).toBe('1 trên 10');
      expect(screen.getByTestId('hero:pause').getAttribute('aria-label')).toBe(
        'Tiếp tục tự chuyển',
      );

      click('hero:pause');
      advance(HERO_ADVANCE_MS + 100);
      expect(counter()).toBe('2 trên 10');
    });

    it('stops while the pointer is over the hero', async () => {
      const hero = await openWithTimers();
      act(() => void fireEvent.mouseEnter(hero));
      advance(30_000);
      expect(counter()).toBe('1 trên 10');
      act(() => void fireEvent.mouseLeave(hero));
      advance(HERO_ADVANCE_MS + 100);
      expect(counter()).toBe('2 trên 10');
    });

    it('restarts the 7 seconds after a manual move', async () => {
      await openWithTimers();
      advance(HERO_ADVANCE_MS - 1_000);
      click('hero:next');
      expect(counter()).toBe('2 trên 10');
      advance(HERO_ADVANCE_MS - 1_000);
      expect(counter()).toBe('2 trên 10');
      advance(1_100);
      expect(counter()).toBe('3 trên 10');
    });
  });
});

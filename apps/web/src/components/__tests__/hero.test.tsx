// @vitest-environment jsdom
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HERO_ADVANCE_MS } from '../../lib/ui/carousel.ts';
import type { Title } from '../../lib/titles/title.ts';
import {
  act,
  fireEvent,
  render,
  screen,
  within,
} from '../../test/test-utils.tsx';
import { Hero } from '../hero.tsx';

const items: Title[] = [
  {
    path: '/phim/psyren-a1/',
    name: 'Psyren',
    image: 'https://img.test/psyren.jpg',
    rating: 8.2,
    episodeLabel: 'Tập 5',
    year: 2026,
    genres: ['Shounen'],
    description: 'A game of survival.',
  },
  {
    path: '/phim/kamui-san-a2/',
    name: 'Kamui-san',
    image: 'https://img.test/kamui.jpg',
    rating: 7,
    episodeLabel: 'Tập 1',
    genres: ['Comedy'],
  },
  {
    path: '/phim/zero-a3/',
    name: 'Zero',
    image: 'https://img.test/zero.jpg',
    rating: 6,
    episodeLabel: 'Tập 2',
    genres: [],
  },
];

describe('the hero', () => {
  afterEach(() => vi.useRealTimers());

  it('shows the title, meta line and play link, and lets only the active slide take focus', async () => {
    render(<Hero items={items} />, { path: '/' });
    await screen.findByTestId('hero');

    const slide = screen.getByTestId('hero:slide:0');
    expect(within(slide).getByRole('heading')).toHaveTextContent('Psyren');
    expect(within(slide).getByTestId('hero:title')).toHaveAttribute(
      'title',
      'Psyren',
    );
    expect(slide).toHaveTextContent('TV · Shounen · 2026 · 8.2/10');
    expect(within(slide).getByTestId('hero:description')).toHaveTextContent(
      'A game of survival.',
    );
    expect(within(slide).getByRole('link', { name: 'Phát' })).toHaveAttribute(
      'href',
      '/watch/psyren-a1',
    );
    expect(slide).toHaveAttribute('data-active');
    expect(
      within(slide).getByRole('link', { name: 'Phát' }),
    ).not.toHaveAttribute('tabindex');
    const second = screen.getByTestId('hero:slide:1');
    expect(second).not.toHaveAttribute('data-active');
    expect(within(second).getByRole('link', { name: 'Phát' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    expect(screen.getByTestId('hero:counter')).toHaveTextContent('1 trên 3');
  });

  it('wraps around with previous and next', async () => {
    render(<Hero items={items} />, { path: '/' });
    await screen.findByTestId('hero');

    await userEvent.click(screen.getByTestId('hero:prev'));
    expect(screen.getByTestId('hero:counter')).toHaveTextContent('3 trên 3');
    expect(screen.getByTestId('hero:slide:2')).toHaveAttribute('data-active');

    await userEvent.click(screen.getByTestId('hero:next'));
    expect(screen.getByTestId('hero:counter')).toHaveTextContent('1 trên 3');
    expect(screen.getByTestId('hero:slide:0')).toHaveAttribute('data-active');
  });

  it('advances every 7 seconds, and stops while paused or while the pointer is over it', async () => {
    render(<Hero items={items} />, { path: '/' });
    const hero = await screen.findByTestId('hero');
    // Autoplay is a plain setTimeout. Moving a slide re-arms it on the fake clock.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
    const click = (id: string) =>
      act(() => void fireEvent.click(screen.getByTestId(id)));
    const counter = screen.getByTestId('hero:counter');
    click('hero:next');
    click('hero:prev');
    expect(counter).toHaveTextContent('1 trên 3');

    advance(HERO_ADVANCE_MS - 100);
    expect(counter).toHaveTextContent('1 trên 3');
    advance(200);
    expect(counter).toHaveTextContent('2 trên 3');

    click('hero:pause');
    advance(30_000);
    expect(counter).toHaveTextContent('2 trên 3');
    expect(screen.getByTestId('hero:pause')).toHaveAccessibleName(
      'Tiếp tục tự chuyển',
    );
    click('hero:pause');

    act(() => void fireEvent.mouseEnter(hero));
    advance(30_000);
    expect(counter).toHaveTextContent('2 trên 3');
    act(() => void fireEvent.mouseLeave(hero));
    advance(HERO_ADVANCE_MS + 100);
    expect(counter).toHaveTextContent('3 trên 3');
  });
});

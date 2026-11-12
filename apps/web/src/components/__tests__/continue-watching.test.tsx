// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { jsonResponse, stubAuth, user } from '../../test/auth-stub.ts';
import { renderApp } from '../../test/render-app.tsx';
import {
  progressRow,
  stubProgressShelf,
} from '../../test/shelf-progress-stub.ts';

const KAMUI = 'ushiro-no-shoumen-kamui-san-a6084';
const signedIn = () => jsonResponse(200, { user });

const shelf = () => screen.getByTestId('shelf:continue-watching');
const maybeShelf = () => screen.queryByTestId('shelf:continue-watching');
const card = (slug: string) => screen.getByTestId(`card:continue:${slug}`);
const rendered = () =>
  [...document.querySelectorAll('[data-testid]')]
    .map((el) => el.getAttribute('data-testid')!)
    .filter((id) => id === 'hero' || /^shelf:[a-z0-9-]+$/.test(id))
    .map((id) => id.replace(/^shelf:/, ''));

async function openHome(
  options: Parameters<typeof stubProgressShelf>[0],
  me: () => Response = signedIn,
) {
  stubAuth({ me });
  const shelfStub = stubProgressShelf(options);
  await renderApp('/');
  await screen.findByTestId('hero');
  await screen.findByTestId('shelf:new-episodes');
  return shelfStub;
}

describe('continue watching row', () => {
  it('sits right after the hero for a signed-in viewer with history', async () => {
    const { reads } = await openHome({
      items: [progressRow('alpha'), progressRow('beta')],
    });
    await screen.findByTestId('shelf:continue-watching');
    expect(rendered().slice(0, 3)).toEqual([
      'hero',
      'continue-watching',
      'new-episodes',
    ]);
    expect(
      within(shelf())
        .getAllByRole('listitem')
        .map((item) =>
          item
            .querySelector('[data-testid^="card:continue:"]')!
            .getAttribute('data-testid'),
        ),
    ).toEqual(['card:continue:alpha', 'card:continue:beta']);
    expect(within(shelf()).getByRole('heading').textContent).toBe(
      'Tiếp tục xem',
    );
    expect(reads[0]?.init?.credentials).toBe('include');
  });

  it('shows a row of one title', async () => {
    await openHome({ items: [progressRow('solo')] });
    await screen.findByTestId('card:continue:solo');
  });

  it('shows a skeleton while a signed-in viewer waits, and none to anyone else', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    stubAuth({ me: signedIn });
    stubProgressShelf({
      respond: async () => {
        await gate;
        return jsonResponse(200, { items: [progressRow('alpha')] });
      },
    });
    await renderApp('/');
    await screen.findByTestId('shelf:continue-watching:loading');
    release();
    await screen.findByTestId('card:continue:alpha');
    expect(screen.queryByTestId('shelf:continue-watching:loading')).toBeNull();
  });

  it('shows nothing, and fetches nothing, when signed out', async () => {
    const auth = stubAuth();
    const { reads } = stubProgressShelf({ items: [progressRow('alpha')] });
    await renderApp('/');
    await screen.findByTestId('hero');
    await screen.findByTestId('shelf:new-episodes');
    expect(auth.to('me')).toHaveLength(1);
    expect(maybeShelf()).toBeNull();
    expect(screen.queryByTestId('shelf:continue-watching:loading')).toBeNull();
    expect(reads).toHaveLength(0);
  });

  it('shows no row and no skeleton for a viewer without history', async () => {
    const { reads } = await openHome({ items: [] });
    await waitFor(() => expect(reads).toHaveLength(1));
    expect(maybeShelf()).toBeNull();
    expect(screen.queryByTestId('shelf:continue-watching:loading')).toBeNull();
  });

  it.each([
    ['a 500', () => jsonResponse(500, { error: 'boom' })],
    ['a 401', () => jsonResponse(401, { error: 'unauthenticated' })],
    [
      'a network error',
      () => Promise.reject(new TypeError('network down')) as never,
    ],
  ])('drops only the row on %s', async (_, respond) => {
    const { reads } = await openHome({ respond });
    await waitFor(() => expect(reads).toHaveLength(1));
    await waitFor(() =>
      expect(
        screen.queryByTestId('shelf:continue-watching:loading'),
      ).toBeNull(),
    );
    expect(maybeShelf()).toBeNull();
    expect(screen.queryByTestId('error-screen')).toBeNull();
    expect(rendered().slice(0, 2)).toEqual(['hero', 'new-episodes']);
  });

  it('takes a title in the row out of the other shelves', async () => {
    await openHome({ items: [progressRow(KAMUI)] });
    await screen.findByTestId('card:continue:' + KAMUI);
    expect(screen.queryByTestId(`card:/phim/${KAMUI}/`)).toBeNull();
  });

  it('links an unfinished card straight to its episode, with a bar and no label under it', async () => {
    await openHome({
      items: [progressRow('alpha', { positionS: 360, durationS: 1440 })],
    });
    const one = await screen.findByTestId('card:continue:alpha');
    const link = within(one).getByRole('link');
    expect(link.getAttribute('href')).toBe('/watch/alpha/7');
    expect(link.getAttribute('aria-label')).toBe(
      'Phim alpha, Tập 7, 6 / 24 phút',
    );
    expect(one.textContent).not.toContain('Tập 7');
    const bar = within(one).getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-label')).toBe(
      'Tiến độ xem Phim alpha, Tập 7',
    );
    expect(bar.getAttribute('aria-valuetext')).toBe('6 / 24 phút');
    expect(bar.firstElementChild).toHaveProperty('style.width', '25%');
    expect(one.querySelector('img')?.getAttribute('src')).toBe(
      'https://img.test/alpha.jpg',
    );
  });

  it('links a finished card to the title alone, with a full bar', async () => {
    await openHome({
      items: [progressRow('alpha', { completed: true, positionS: 1440 })],
    });
    const one = await screen.findByTestId('card:continue:alpha');
    expect(within(one).getByRole('link').getAttribute('href')).toBe(
      '/watch/alpha',
    );
    const bar = within(one).getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toBe('Đã xem xong');
    expect(one.textContent).not.toContain('Tập 7');
  });

  it('opens the popover on hover with the title, episode, bar, time and a play link', async () => {
    await openHome({ items: [progressRow('alpha')] });
    const user = userEvent.setup();
    await user.hover(await screen.findByTestId('card:continue:alpha'));
    const preview = await screen.findByTestId('card:continue:alpha:preview');
    expect(within(preview).getByRole('heading').textContent).toBe('Phim alpha');
    expect(preview.textContent).toContain('Tập 7');
    expect(preview.textContent).toContain('12 / 24 phút');
    expect(
      within(preview)
        .getByRole('link', { name: 'Phát Phim alpha' })
        .getAttribute('href'),
    ).toBe('/watch/alpha/7');
    expect(
      within(preview).getByTestId('card:continue:alpha:preview:progress'),
    ).toBeTruthy();
    expect(
      within(preview).getByRole('button', { name: 'Xem chi tiết Phim alpha' }),
    ).toBeTruthy();
    expect(
      within(preview).getByTestId('card:continue:alpha:details:tooltip')
        .textContent,
    ).toBe('Tập & thông tin');
    expect(preview.textContent).not.toContain('Tập mới');
  });

  it('opens the details modal from the chevron and from the popover body', async () => {
    await openHome({ items: [progressRow('alpha')] });
    const user = userEvent.setup();
    await user.hover(await screen.findByTestId('card:continue:alpha'));
    await user.click(await screen.findByTestId('card:continue:alpha:details'));
    expect(await screen.findByTestId('details')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Phim alpha' })).toBeTruthy();
    await user.click(screen.getByTestId('details:close'));
    await waitFor(() => expect(screen.queryByTestId('details')).toBeNull());

    await user.unhover(card('alpha'));
    await user.hover(card('alpha'));
    await user.click(await screen.findByTestId('card:continue:alpha:body'));
    expect(await screen.findByTestId('details')).toBeTruthy();
  });

  it('says Đã xem xong in the popover of a finished card', async () => {
    await openHome({
      items: [progressRow('alpha', { completed: true })],
    });
    await userEvent
      .setup()
      .hover(await screen.findByTestId('card:continue:alpha'));
    const preview = await screen.findByTestId('card:continue:alpha:preview');
    expect(preview.textContent).toContain('Đã xem xong');
    expect(preview.textContent).not.toContain('phút');
    expect(
      within(preview)
        .getByRole('link', { name: 'Phát Phim alpha' })
        .getAttribute('href'),
    ).toBe('/watch/alpha');
  });

  it('moves focus across the cards with the arrow keys', async () => {
    await openHome({
      items: [progressRow('a'), progressRow('b'), progressRow('c')],
    });
    const user = userEvent.setup();
    const cover = (slug: string) =>
      within(card(slug)).getByRole('link', { name: /^Phim / });
    await screen.findByTestId('card:continue:c');
    cover('a').focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(cover('b'));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(cover('c'));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(cover('c'));
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(cover('b'));
  });
});

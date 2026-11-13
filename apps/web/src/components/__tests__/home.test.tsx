// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '../../test/test-utils.tsx';
import { homeHtml, newEpisodesHtml, seasonHtml } from '../__mockData__/home.ts';
import { Home } from '../home.tsx';

const shelfIds = () =>
  [...document.querySelectorAll('[data-testid]')]
    .map((el) => el.getAttribute('data-testid')!)
    .filter((id) => id === 'hero' || /^shelf:[a-z0-9-]+$/.test(id))
    .map((id) => id.replace(/^shelf:/, ''));

describe('the home page', () => {
  it('shows the hero, then the shelves in order, each with its see-all link', async () => {
    fetchMock
      .get('path:/', homeHtml)
      .get('path:/danh-sach/all/all/all/all/all/all/jp/', newEpisodesHtml)
      .get('path:/danh-sach/all/all/autumn/2026/all/all/jp/', seasonHtml);
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );

    expect(shelfIds()).toEqual([
      'hero',
      'new-episodes',
      'top-10-today',
      'airing-this-season',
      'upcoming',
    ]);
    expect(screen.getByTestId('hero')).toHaveTextContent('Hero 1');
    expect(screen.getByTestId('shelf:new-episodes')).toHaveTextContent(
      'Tập mới',
    );
    expect(screen.getByTestId('shelf:new-episodes:see-all')).toHaveAttribute(
      'href',
      '/new-episodes',
    );
    expect(
      screen.getByTestId('shelf:airing-this-season:see-all'),
    ).toHaveAttribute('href', '/airing-this-season');
    expect(screen.getByTestId('shelf:upcoming:see-all')).toHaveAttribute(
      'href',
      '/upcoming',
    );
    expect(
      screen.queryByTestId('shelf:top-10-today:see-all'),
    ).not.toBeInTheDocument();
  });

  it('numbers the top 10 and counts the upcoming titles down', async () => {
    fetchMock
      .get('path:/', homeHtml)
      .get('path:/danh-sach/all/all/all/all/all/all/jp/', newEpisodesHtml)
      .get('path:/danh-sach/all/all/autumn/2026/all/all/jp/', seasonHtml);
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );

    const top = within(screen.getByTestId('shelf:top-10-today'));
    expect(top.getAllByRole('listitem')[0]).toHaveTextContent('1');
    expect(top.getAllByRole('listitem')[1]).toHaveTextContent('2');
    expect(top.getByLabelText(/^Hạng 1: top 1/)).toBeVisible();
    expect(
      within(screen.getByTestId('shelf:upcoming')).getAllByTestId(
        'card:countdown',
      )[0],
    ).toHaveTextContent('Hôm nay');
  });

  it('shows skeletons until the home page arrives, then the season shelf loads on its own', async () => {
    fetchMock
      .get('path:/', homeHtml, { delay: 200 })
      .get('path:/danh-sach/all/all/all/all/all/all/jp/', newEpisodesHtml)
      .get('path:/danh-sach/all/all/autumn/2026/all/all/jp/', seasonHtml, {
        delay: 200,
      });
    render(<Home />, { path: '/' });

    expect(await screen.findByTestId('home:loading')).toBeVisible();
    expect(screen.queryByTestId('hero')).not.toBeInTheDocument();

    expect(await screen.findByTestId('hero')).toBeVisible();
    expect(screen.queryByTestId('home:loading')).not.toBeInTheDocument();
    expect(
      screen.getByTestId('shelf:airing-this-season:loading'),
    ).toBeVisible();
    expect(screen.getByTestId('shelf:top-10-today')).toBeVisible();
    // The upcoming shelf waits so the season shelf does not land above it later.
    expect(screen.queryByTestId('shelf:upcoming')).not.toBeInTheDocument();

    expect(await screen.findByTestId('shelf:upcoming')).toBeVisible();
    expect(shelfIds()).toEqual([
      'hero',
      'new-episodes',
      'top-10-today',
      'airing-this-season',
      'upcoming',
    ]);
  });

  it('drops only the season shelf when its list fails', async () => {
    fetchMock
      .get('path:/', homeHtml)
      .get('path:/danh-sach/all/all/all/all/all/all/jp/', newEpisodesHtml)
      .get('path:/danh-sach/all/all/autumn/2026/all/all/jp/', 404);
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );

    expect(shelfIds()).toEqual([
      'hero',
      'new-episodes',
      'top-10-today',
      'upcoming',
    ]);
    expect(screen.queryByTestId('error-screen')).not.toBeInTheDocument();
  });

  it('drops only the new episodes shelf when its list fails', async () => {
    fetchMock
      .get('path:/', homeHtml)
      .get('path:/danh-sach/all/all/all/all/all/all/jp/', 500)
      .get('path:/danh-sach/all/all/autumn/2026/all/all/jp/', seasonHtml);
    render(<Home />, { path: '/' });
    expect(await screen.findByTestId('shelf:upcoming')).toBeVisible();
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/all/all/all/all/jp/',
    );

    expect(shelfIds()).toEqual([
      'hero',
      'top-10-today',
      'airing-this-season',
      'upcoming',
    ]);
    expect(screen.queryByTestId('error-screen')).not.toBeInTheDocument();
  });

  it('shows the error screen when the home page fails', async () => {
    fetchMock
      .get('path:/', 503)
      .get('path:/danh-sach/all/all/all/all/all/all/jp/', newEpisodesHtml);
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/');

    expect(screen.getByTestId('error-screen')).toBeVisible();
    expect(screen.queryByTestId('hero')).not.toBeInTheDocument();
  });

  it('moves focus across the covers of a shelf with the arrow keys', async () => {
    fetchMock
      .get('path:/', homeHtml)
      .get('path:/danh-sach/all/all/all/all/all/all/jp/', newEpisodesHtml)
      .get('path:/danh-sach/all/all/autumn/2026/all/all/jp/', seasonHtml);
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/autumn/2026/all/all/jp/',
    );
    const covers = screen
      .getByTestId('shelf:new-episodes')
      .querySelectorAll<HTMLElement>('[data-cover]');

    covers[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(covers[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(covers[0]).toHaveFocus();
  });
});

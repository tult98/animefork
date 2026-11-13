// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '../../test/test-utils.tsx';
import {
  homeArtHtml,
  homeArtNewEpisodesHtml,
} from '../__mockData__/home-art.ts';
import { Home } from '../home.tsx';

// The mock page has heroes hero-1-a1 and hero-2-a2, top 10 titles top-1-a1 to top-8-a8 and new episodes fresh-1-a1 to fresh-8-a8.
beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test'));

describe('the art on the home page', () => {
  it('puts TMDB art and the stored overview on the titles the lookup knows and keeps the source image on the others', async () => {
    fetchMock
      .get('path:/v1/auth/me', 401)
      .get('path:/', homeArtHtml)
      .get(
        'path:/danh-sach/all/all/all/all/all/all/jp/',
        homeArtNewEpisodesHtml,
      )
      .post('path:/v1/art/lookup', {
        art: {
          'hero-1-a1': {
            status: 'ready',
            backdropPath: '/hero.jpg',
            backdropLang: 'vi',
            posterPath: null,
            overview: 'Một nữ thần mới đến thế giới khác.',
          },
          'top-1-a1': {
            status: 'ready',
            backdropPath: '/top.jpg',
            backdropLang: 'vi',
            posterPath: '/top-poster.jpg',
          },
        },
      });
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/v1/art/lookup', {
      method: 'post',
    });

    const first = screen.getByTestId('hero:slide:0');
    await waitFor(() =>
      expect(within(first).getByRole('presentation')).toHaveAttribute(
        'src',
        'https://image.tmdb.org/t/p/original/hero.jpg',
      ),
    );
    expect(within(first).getByTestId('hero:description')).toHaveTextContent(
      'Một nữ thần mới đến thế giới khác.',
    );
    const second = screen.getByTestId('hero:slide:1');
    expect(within(second).getByRole('presentation')).toHaveAttribute(
      'src',
      expect.stringMatching(/^https:\/\/cdn\.animevietsub\.best\//),
    );
    expect(within(second).getByTestId('hero:description')).toHaveTextContent(
      'About hero 2.',
    );

    const top = screen.getByTestId('shelf:top-10-today');
    expect(within(top).getByRole('img', { name: 'top 1' })).toHaveAttribute(
      'src',
      'https://image.tmdb.org/t/p/w342/top-poster.jpg',
    );
    expect(within(top).getByRole('img', { name: 'top 2' })).toHaveAttribute(
      'src',
      expect.stringMatching(/^https:\/\/cdn\.animevietsub\.best\//),
    );
    expect(screen.queryByTestId('hero:art-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card:art-skeleton')).not.toBeInTheDocument();
  });

  it('shows skeletons instead of source images while the lookup is in flight, then the TMDB art', async () => {
    fetchMock
      .get('path:/v1/auth/me', 401)
      .get('path:/', homeArtHtml)
      .get(
        'path:/danh-sach/all/all/all/all/all/all/jp/',
        homeArtNewEpisodesHtml,
      )
      .post(
        'path:/v1/art/lookup',
        {
          art: {
            'hero-1-a1': {
              status: 'ready',
              backdropPath: '/hero.jpg',
              backdropLang: 'vi',
              posterPath: null,
            },
            'fresh-1-a1': {
              status: 'ready',
              backdropPath: '/kamui.jpg',
              backdropLang: 'vi',
              posterPath: null,
            },
          },
        },
        { delay: 300 },
      );
    render(<Home />, { path: '/' });

    const first = await screen.findByTestId('hero:slide:0');
    expect(within(first).getByTestId('hero:art-skeleton')).toBeVisible();
    expect(within(first).queryByRole('presentation')).not.toBeInTheDocument();
    const episodes = screen.getByTestId('shelf:new-episodes');
    expect(within(episodes).getAllByTestId('card:art-skeleton')).toHaveLength(
      8,
    );
    expect(within(episodes).queryByRole('img')).not.toBeInTheDocument();

    await expect(fetchMock).toBeFetched('path:/v1/art/lookup', {
      method: 'post',
    });
    await waitFor(() =>
      expect(within(first).getByRole('presentation')).toHaveAttribute(
        'src',
        'https://image.tmdb.org/t/p/original/hero.jpg',
      ),
    );
    expect(
      within(episodes).getByRole('img', {
        name: 'fresh 1',
      }),
    ).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w780/kamui.jpg');
    expect(screen.queryByTestId('hero:art-skeleton')).not.toBeInTheDocument();
  });

  it('shows the source images at once when the lookup fails', async () => {
    fetchMock
      .get('path:/v1/auth/me', 401)
      .get('path:/', homeArtHtml)
      .get(
        'path:/danh-sach/all/all/all/all/all/all/jp/',
        homeArtNewEpisodesHtml,
      )
      .post('path:/v1/art/lookup', 500);
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/v1/art/lookup', {
      method: 'post',
    });

    await waitFor(() =>
      expect(screen.queryByTestId('hero:art-skeleton')).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId('hero:slide:0')).getByRole('presentation'),
    ).toHaveAttribute(
      'src',
      expect.stringMatching(/^https:\/\/cdn\.animevietsub\.best\//),
    );
    expect(screen.queryByTestId('card:art-skeleton')).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId('shelf:new-episodes')).getByRole('img', {
        name: 'fresh 1',
      }),
    ).toHaveAttribute(
      'src',
      expect.stringMatching(/^https:\/\/cdn\.animevietsub\.best\//),
    );
  });

  it('keeps the skeleton on a pending title until the next poll, then shows its source image', async () => {
    fetchMock
      .get('path:/v1/auth/me', 401)
      .get('path:/', homeArtHtml)
      .get(
        'path:/danh-sach/all/all/all/all/all/all/jp/',
        homeArtNewEpisodesHtml,
      )
      .post('path:/v1/art/lookup', {
        art: { 'hero-1-a1': { status: 'pending' } },
      });
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/v1/art/lookup', {
      method: 'post',
    });

    const first = screen.getByTestId('hero:slide:0');
    expect(within(first).getByTestId('hero:art-skeleton')).toBeVisible();
    expect(within(first).queryByRole('presentation')).not.toBeInTheDocument();

    expect(
      await within(first).findByRole('presentation', {}, { timeout: 5000 }),
    ).toHaveAttribute(
      'src',
      expect.stringMatching(/^https:\/\/cdn\.animevietsub\.best\//),
    );
    expect(
      within(first).queryByTestId('hero:art-skeleton'),
    ).not.toBeInTheDocument();
  }, 10000);

  it('never waits for art and never calls the lookup when no API is configured', async () => {
    vi.stubEnv('VITE_API_URL', '');
    fetchMock
      .get('path:/', homeArtHtml)
      .get(
        'path:/danh-sach/all/all/all/all/all/all/jp/',
        homeArtNewEpisodesHtml,
      );
    render(<Home />, { path: '/' });
    await expect(fetchMock).toBeFetched(
      'path:/danh-sach/all/all/all/all/all/all/jp/',
    );

    expect(
      within(await screen.findByTestId('hero:slide:0')).getByRole(
        'presentation',
      ),
    ).toHaveAttribute(
      'src',
      expect.stringMatching(/^https:\/\/cdn\.animevietsub\.best\//),
    );
    expect(screen.queryByTestId('card:art-skeleton')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveFetched('path:/v1/art/lookup');
  });
});

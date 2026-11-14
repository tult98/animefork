// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import { useNavigate, useRouterState } from '@tanstack/react-router';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryResponse } from '../../../../../api/src/library/contract.ts';
import { render, screen, within } from '../../../test/test-utils.tsx';
import { LibraryPage } from '../library-page.tsx';

const user = { id: 'u1', email: 'mai@example.com' };

const alpha = {
  titleName: 'Alpha',
  image: 'https://img.test/a.jpg',
  genres: ['Action', 'Drama'],
};
const beta = {
  titleName: 'Beta',
  image: 'https://img.test/b.jpg',
  genres: ['Comedy'],
};

const library: LibraryResponse = {
  ratings: [
    { slug: 'alpha', rating: 'like', ...alpha, updatedAt: 't1' },
    { slug: 'beta', rating: 'dislike', ...beta, updatedAt: 't1' },
  ],
  playlists: [
    {
      id: 'p1',
      name: 'Cozy',
      items: [{ slug: 'beta', ...beta, addedAt: 't1' }],
    },
    { id: 'p2', name: 'Marathon', items: [] },
  ],
};

const historyRow = {
  slug: 'gamma',
  episodeId: '7',
  episodeLabel: 'Tập 7',
  titleName: 'Gamma',
  image: 'https://img.test/g.jpg',
  seasonSlug: null,
  positionS: 720,
  durationS: 1440,
  completed: false,
  updatedAt: '2026-11-10T10:00:00.000Z',
};

// The route's wiring: the section lives in the URL.
function Page() {
  const navigate = useNavigate();
  const section = useRouterState({
    select: (state) => (state.location.search as { section?: string }).section,
  });
  return (
    <LibraryPage
      section={section ?? 'history'}
      onSection={(next) =>
        void navigate({ to: '/my-list', search: { section: next } })
      }
    />
  );
}

function signedIn(stored: () => LibraryResponse = () => library) {
  fetchMock
    .get('path:/v1/auth/me', { user })
    .get('path:/v1/library', () => stored())
    .get('path:/v1/watch-progress', { items: [historyRow] });
}

beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test'));

describe('the library page', () => {
  it('lists the liked titles and removes one with a DELETE', async () => {
    let stored = library;
    signedIn(() => stored);
    fetchMock.delete('path:/v1/library/ratings/alpha', () => {
      stored = { ...library, ratings: library.ratings.slice(1) };
      return 204;
    });
    render(<Page />, { path: '/my-list?section=liked' });
    await expect(fetchMock).toBeFetched('path:/v1/library');

    const card = screen.getByTestId('library:card:alpha');
    expect(card).toHaveTextContent('Action · Drama');
    expect(within(card).getByRole('link')).toHaveAttribute(
      'href',
      '/watch/alpha',
    );
    await userEvent.click(
      within(card).getByRole('button', { name: 'Bỏ thích' }),
    );

    await expect(fetchMock).toBeFetched('path:/v1/library/ratings/alpha', {
      method: 'delete',
    });
    expect(screen.queryByTestId('library:card:alpha')).not.toBeInTheDocument();
    expect(screen.getByTestId('library:empty')).toHaveTextContent(
      'Chưa thích tiêu đề nào',
    );
  });

  it('switches section from the sidebar and keeps it in the URL', async () => {
    signedIn();
    const { router } = render(<Page />, { path: '/my-list' });
    await expect(fetchMock).toBeFetched('path:/v1/library');
    expect(screen.getByTestId('library:nav:history')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await userEvent.click(screen.getByTestId('library:nav:p1'));

    expect(router.state.location.search).toEqual({ section: 'p1' });
    expect(screen.getByTestId('library:nav:p1')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByTestId('library:nav:p1')).toHaveTextContent('Cozy1');
    expect(screen.getByTestId('library:card:beta')).toBeVisible();
    expect(screen.queryByTestId('library:card:alpha')).not.toBeInTheDocument();
  });

  it('asks a signed-out viewer to sign in and requests no library', async () => {
    fetchMock.get('path:/v1/auth/me', 401);
    render(<Page />, { path: '/my-list' });

    const prompt = await screen.findByTestId('library:sign-in');
    expect(
      within(prompt).getByRole('link', { name: 'Đăng nhập' }),
    ).toHaveAttribute('href', '/sign-in');
    expect(fetchMock).not.toHaveFetched('path:/v1/library');
    expect(fetchMock).not.toHaveFetched('path:/v1/watch-progress');
  });

  it('shows the empty state of an empty playlist', async () => {
    signedIn();
    render(<Page />, { path: '/my-list?section=p2' });
    await expect(fetchMock).toBeFetched('path:/v1/library');

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Marathon',
    );
    expect(screen.getByTestId('library:empty')).toHaveTextContent(
      'Lưu một tiêu đề vào danh sách này từ thẻ của nó.',
    );
  });

  it('lists the watch history with no remove button', async () => {
    signedIn();
    render(<Page />, { path: '/my-list' });
    await expect(fetchMock).toBeFetched('path:/v1/watch-progress');

    const card = screen.getByTestId('library:history:gamma');
    expect(card).toHaveTextContent('GammaTập 7');
    expect(within(card).getByRole('link')).toHaveAttribute(
      'href',
      '/watch/gamma/7',
    );
    expect(
      screen.queryByRole('button', { name: /Bỏ|Xóa/ }),
    ).not.toBeInTheDocument();
  });
});

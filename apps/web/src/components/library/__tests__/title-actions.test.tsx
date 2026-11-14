// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryResponse } from '../../../../../api/src/library/contract.ts';
import type { Title } from '../../../lib/titles/title.ts';
import { render, screen, within } from '../../../test/test-utils.tsx';
import { DetailsModal } from '../../details/details-modal.tsx';
import { TitleActions, TitleStatus } from '../title-actions.tsx';

const title = {
  path: '/phim/alpha/',
  name: 'Alpha',
  image: 'https://img.test/a.jpg',
  genres: ['Action'],
} as Title;

const snapshot = {
  titleName: 'Alpha',
  image: 'https://img.test/a.jpg',
  genres: ['Action'],
};

const library: LibraryResponse = {
  ratings: [],
  playlists: [
    { id: 'p1', name: 'Cozy', items: [] },
    { id: 'p2', name: 'Marathon', items: [] },
  ],
};

beforeEach(() => void vi.stubEnv('VITE_API_URL', 'https://api.test'));

// The server's copy, which the refetch after each write reads back.
let stored: LibraryResponse;

const rated = (rating: 'like' | 'dislike'): LibraryResponse => ({
  ...library,
  ratings: [{ slug: 'alpha', rating, ...snapshot, updatedAt: 't1' }],
});

const inPlaylist = (id: string): LibraryResponse => ({
  ...library,
  playlists: library.playlists.map((playlist) =>
    playlist.id === id
      ? { ...playlist, items: [{ slug: 'alpha', ...snapshot, addedAt: 't1' }] }
      : playlist,
  ),
});

async function renderSignedIn() {
  stored = library;
  fetchMock
    .get('path:/v1/auth/me', { user: { id: 'u1', email: 'mai@example.com' } })
    .get('path:/v1/library', () => stored);
  render(
    <>
      <TitleActions title={title} />
      <TitleStatus title={title} />
    </>,
    { path: '/' },
  );
  await expect(fetchMock).toBeFetched('path:/v1/library');
}

const button = (name: string) => screen.getByRole('button', { name });

describe('the title actions', () => {
  it('likes a title with a PUT and shows the like pressed', async () => {
    await renderSignedIn();
    fetchMock.put('path:/v1/library/ratings/alpha', () => {
      stored = rated('like');
      return 204;
    });

    await userEvent.click(button('Thích'));

    await expect(fetchMock).toBeFetched('path:/v1/library/ratings/alpha', {
      method: 'put',
      body: { rating: 'like', ...snapshot },
    });
    expect(button('Thích')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('title:status')).toHaveTextContent(
      'Bạn đã thích tiêu đề này',
    );
  });

  it('leaves only the dislike pressed after a like and then a dislike', async () => {
    await renderSignedIn();
    let sent = 0;
    fetchMock.put('path:/v1/library/ratings/alpha', () => {
      stored = rated(sent++ === 0 ? 'like' : 'dislike');
      return 204;
    });

    await userEvent.click(button('Thích'));
    await userEvent.click(button('Không thích'));

    await expect(fetchMock).toBeFetched('path:/v1/library/ratings/alpha', {
      method: 'put',
      body: { rating: 'dislike', ...snapshot },
    });
    expect(button('Không thích')).toHaveAttribute('aria-pressed', 'true');
    expect(button('Thích')).toHaveAttribute('aria-pressed', 'false');
  });

  it('adds the title to a playlist from the save dialog and checks the box', async () => {
    await renderSignedIn();
    fetchMock.put('path:/v1/library/playlists/p2/items/alpha', () => {
      stored = inPlaylist('p2');
      return 204;
    });

    await userEvent.click(button('Lưu vào danh sách'));
    const dialog = await screen.findByTestId('save-playlist');
    await userEvent.click(within(dialog).getByLabelText('Marathon'));

    await expect(fetchMock).toBeFetched(
      'path:/v1/library/playlists/p2/items/alpha',
      { method: 'put', body: snapshot },
    );
    expect(within(dialog).getByLabelText('Marathon')).toBeChecked();
    expect(within(dialog).getByLabelText('Cozy')).not.toBeChecked();
    expect(button('Đã lưu. Sửa danh sách')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('keeps the create form open with an error when the playlist name is taken', async () => {
    await renderSignedIn();
    fetchMock.post('path:/v1/library/playlists', {
      status: 409,
      body: { error: 'playlist_name_taken' },
    });

    await userEvent.click(button('Lưu vào danh sách'));
    const dialog = await screen.findByTestId('save-playlist');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Danh sách mới' }),
    );
    const create = within(dialog).getByRole('button', { name: 'Tạo' });
    expect(create).toBeDisabled();
    await userEvent.type(
      within(dialog).getByLabelText('Tên danh sách'),
      ' Cozy ',
    );
    await userEvent.click(create);

    await expect(fetchMock).toBeFetched('path:/v1/library/playlists', {
      method: 'post',
      body: { name: 'Cozy' },
    });
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Bạn đã có danh sách với tên này.',
    );
    expect(within(dialog).getByLabelText('Tên danh sách')).toBeVisible();
  });

  it('sends a signed-out viewer to sign-in without any library request', async () => {
    fetchMock.get('path:/v1/auth/me', 401);
    const { router } = render(<TitleActions title={title} />, { path: '/' });
    await expect(fetchMock).toBeFetched('path:/v1/auth/me');

    await userEvent.click(button('Thích'));

    expect(router.state.location.pathname).toBe('/sign-in');
    expect(fetchMock).not.toHaveFetched('path:/v1/library');
    expect(fetchMock).not.toHaveFetched('path:/v1/library/ratings/alpha');
  });

  it('closes the save dialog without closing the details modal under it', async () => {
    fetchMock
      .get('path:/v1/auth/me', { user: { id: 'u1', email: 'mai@example.com' } })
      .get('path:/v1/library', library);
    const onClose = vi.fn();
    render(<DetailsModal title={title} upcoming onClose={onClose} />, {
      path: '/',
    });
    await expect(fetchMock).toBeFetched('path:/v1/library');

    await userEvent.click(button('Lưu vào danh sách'));
    const dialog = await screen.findByTestId('save-playlist');
    await userEvent.click(within(dialog).getByTestId('save-playlist:close'));

    expect(screen.queryByTestId('save-playlist')).not.toBeInTheDocument();
    expect(screen.getByTestId('details')).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    expect(button('Lưu vào danh sách')).toHaveFocus();
  });
});

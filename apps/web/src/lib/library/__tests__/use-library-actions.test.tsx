// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryResponse } from '../../../../../api/src/library/contract.ts';
import { renderHook, waitFor } from '../../../test/test-utils.tsx';
import type { Title } from '../../titles/title.ts';
import { ratingOf } from '../model.ts';
import { useLibrary } from '../use-library.ts';
import { useLibraryActions } from '../use-library-actions.ts';

const user = { id: 'u1', email: 'mai@example.com' };

const title = {
  path: '/phim/alpha/',
  name: 'Alpha',
  image: 'https://img.test/a.jpg',
  genres: ['Action'],
} as Title;

const empty: LibraryResponse = { ratings: [], playlists: [] };

function useBoth() {
  return { library: useLibrary(), actions: useLibraryActions() };
}

async function ready(library: LibraryResponse = empty) {
  fetchMock
    .get('path:/v1/auth/me', { user })
    .get('path:/v1/library', library, { name: 'library' });
  const hook = renderHook(useBoth);
  await waitFor(() => expect(hook.result.current.library.status).toBe('ready'));
  return hook;
}

const liked = (hook: Awaited<ReturnType<typeof ready>>) => {
  const { library } = hook.result.current;
  return library.status === 'ready' ? ratingOf(library.library, 'alpha') : null;
};

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test');
});

describe('library actions', () => {
  it('likes a title at once, sends the snapshot, and rolls back when the request fails', async () => {
    const hook = await ready();
    fetchMock.put('path:/v1/library/ratings/alpha', 500, { delay: 50 });

    const result = hook.result.current.actions.setRating(title, 'like');
    await waitFor(() => expect(liked(hook)).toBe('like'));
    expect(await result).toEqual({ ok: false, reason: 'failed' });

    expect(fetchMock).toHaveFetched('path:/v1/library/ratings/alpha', {
      method: 'PUT',
      body: {
        rating: 'like',
        titleName: 'Alpha',
        image: 'https://img.test/a.jpg',
        genres: ['Action'],
      },
    });
    await waitFor(() => expect(liked(hook)).toBe('none'));
  });

  it('clears a rating with a DELETE', async () => {
    const hook = await ready({
      ratings: [
        {
          slug: 'alpha',
          rating: 'dislike',
          titleName: 'Alpha',
          image: 'https://img.test/a.jpg',
          genres: [],
          updatedAt: 't1',
        },
      ],
      playlists: [],
    });
    fetchMock.delete('path:/v1/library/ratings/alpha', 204);

    expect(await hook.result.current.actions.setRating(title, 'none')).toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveFetched('path:/v1/library/ratings/alpha', {
      method: 'DELETE',
    });
  });

  it('reports a duplicate playlist name as nameTaken', async () => {
    const hook = await ready();
    fetchMock.post('path:/v1/library/playlists', {
      status: 409,
      body: { error: 'playlist_name_taken' },
    });

    expect(await hook.result.current.actions.createPlaylist('Weekend')).toEqual(
      { ok: false, reason: 'nameTaken' },
    );
    expect(fetchMock).toHaveFetched('path:/v1/library/playlists', {
      method: 'POST',
      body: { name: 'Weekend' },
    });
  });

  it('sends no request when signed out and says sign-in is required', async () => {
    fetchMock.get('path:/v1/auth/me', 401);
    const hook = renderHook(useBoth);
    await waitFor(() =>
      expect(hook.result.current.library.status).toBe('none'),
    );

    expect(hook.result.current.actions.requiresSignIn).toBe(true);
    expect(await hook.result.current.actions.setRating(title, 'like')).toEqual({
      ok: false,
      reason: 'requiresSignIn',
    });
    expect(fetchMock.callHistory.calls('path:/v1/library')).toHaveLength(0);
  });
});

import { useQueryClient } from '@tanstack/react-query';
import type {
  LibraryResponse,
  PlaylistSummary,
} from '../../../../api/src/library/contract.ts';
import { ApiError, api } from '../api/client.ts';
import { useSession } from '../auth/session.ts';
import type { Title } from '../titles/title.ts';
import {
  slugOf,
  snapshotOf,
  withPlaylist,
  withPlaylistItem,
  withRating,
  type RatingState,
} from './model.ts';
import { libraryKey } from './use-library.ts';

export type ActionResult =
  { ok: true } | { ok: false; reason: 'requiresSignIn' | 'failed' };

export type CreatePlaylistResult =
  | { ok: true; playlist: PlaylistSummary }
  | { ok: false; reason: 'requiresSignIn' | 'failed' | 'nameTaken' };

const SIGN_IN_REQUIRED = { ok: false, reason: 'requiresSignIn' } as const;

const isNameTaken = (error: unknown) =>
  error instanceof ApiError &&
  error.status === 409 &&
  error.code === 'playlist_name_taken';

export function useLibraryActions() {
  const session = useSession();
  const queryClient = useQueryClient();
  const userId = session.state === 'signedIn' && session.user.id;
  const key = libraryKey(userId);

  // Shows the change at once and returns the way back if the request fails.
  async function optimistic(
    patch: (library: LibraryResponse) => LibraryResponse,
    request: () => Promise<unknown>,
  ): Promise<ActionResult> {
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<LibraryResponse>(key);
    if (previous) queryClient.setQueryData(key, patch(previous));
    try {
      await request();
      return { ok: true };
    } catch {
      queryClient.setQueryData(key, previous);
      return { ok: false, reason: 'failed' };
    } finally {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }

  return {
    requiresSignIn: !userId,

    setRating(title: Title, rating: RatingState): Promise<ActionResult> {
      if (!userId) return Promise.resolve(SIGN_IN_REQUIRED);
      const slug = slugOf(title);
      const snapshot = snapshotOf(title);
      const path = `v1/library/ratings/${encodeURIComponent(slug)}`;
      return optimistic(
        (library) =>
          withRating(library, slug, rating, snapshot, new Date().toISOString()),
        () =>
          rating === 'none'
            ? api.delete(path)
            : api.put(path, { json: { rating, ...snapshot } }),
      );
    },

    setInPlaylist(
      playlistId: string,
      title: Title,
      inPlaylist: boolean,
    ): Promise<ActionResult> {
      if (!userId) return Promise.resolve(SIGN_IN_REQUIRED);
      const slug = slugOf(title);
      const snapshot = snapshotOf(title);
      const path = `v1/library/playlists/${encodeURIComponent(playlistId)}/items/${encodeURIComponent(slug)}`;
      return optimistic(
        (library) =>
          withPlaylistItem(
            library,
            playlistId,
            slug,
            inPlaylist,
            snapshot,
            new Date().toISOString(),
          ),
        () =>
          inPlaylist ? api.put(path, { json: snapshot }) : api.delete(path),
      );
    },

    // The id comes from the server, so the playlist appears when it answers and not before.
    async createPlaylist(name: string): Promise<CreatePlaylistResult> {
      if (!userId) return SIGN_IN_REQUIRED;
      try {
        const playlist = await api
          .post('v1/library/playlists', { json: { name } })
          .json<PlaylistSummary>();
        queryClient.setQueryData<LibraryResponse>(
          key,
          (library) => library && withPlaylist(library, playlist),
        );
        return { ok: true, playlist };
      } catch (error) {
        return {
          ok: false,
          reason: isNameTaken(error) ? 'nameTaken' : 'failed',
        };
      } finally {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  };
}

import type { Title } from '../titles/title.ts';
import {
  playlistsContaining,
  ratingOf,
  slugOf,
  type RatingState,
} from './model.ts';
import { useLibrary } from './use-library.ts';

export interface TitlePlaylist {
  id: string;
  name: string;
  has: boolean;
}

export interface TitleLibrary {
  pending: boolean;
  rating: RatingState;
  playlists: TitlePlaylist[];
}

// What the viewer's library says about one title. Signed out and failed both read as an empty library.
export function useTitleLibrary(title: Title): TitleLibrary {
  const state = useLibrary();
  if (state.status !== 'ready') {
    return {
      pending: state.status === 'pending',
      rating: 'none',
      playlists: [],
    };
  }
  const slug = slugOf(title);
  const holding = new Set(playlistsContaining(state.library, slug));
  return {
    pending: false,
    rating: ratingOf(state.library, slug),
    playlists: state.library.playlists.map(({ id, name }) => ({
      id,
      name,
      has: holding.has(id),
    })),
  };
}

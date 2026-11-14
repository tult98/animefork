import type {
  LibraryPlaylist,
  LibraryRating,
  LibraryResponse,
  PlaylistSummary,
  Rating,
} from '../../../../api/src/library/contract.ts';
import { titleWatchLink } from '../titles/link.ts';
import type { Title } from '../titles/title.ts';

export type RatingState = Rating | 'none';

export interface TitleSnapshot {
  titleName: string;
  image: string;
  genres: string[];
}

export interface LibraryTitle extends TitleSnapshot {
  slug: string;
}

export interface LibrarySections {
  liked: LibraryTitle[];
  disliked: LibraryTitle[];
  playlists: (PlaylistSummary & { titles: LibraryTitle[] })[];
}

export interface LibraryCounts {
  liked: number;
  disliked: number;
  playlists: Record<string, number>;
}

// The same slug the watch page and the progress rows use. It is season-level, so two seasons are two keys.
export function slugOf(title: Pick<Title, 'path'>): string {
  return titleWatchLink(title).params.slug;
}

export function snapshotOf(title: Title): TitleSnapshot {
  return { titleName: title.name, image: title.image, genres: title.genres };
}

export function ratingOf(library: LibraryResponse, slug: string): RatingState {
  return library.ratings.find((row) => row.slug === slug)?.rating ?? 'none';
}

export function playlistsContaining(
  library: LibraryResponse,
  slug: string,
): string[] {
  return library.playlists
    .filter((playlist) => playlist.items.some((item) => item.slug === slug))
    .map((playlist) => playlist.id);
}

function toLibraryTitle({
  slug,
  titleName,
  image,
  genres,
}: LibraryTitle): LibraryTitle {
  return { slug, titleName, image, genres };
}

export function sectionsOf(library: LibraryResponse): LibrarySections {
  const rated = (rating: Rating) =>
    library.ratings.filter((row) => row.rating === rating).map(toLibraryTitle);
  return {
    liked: rated('like'),
    disliked: rated('dislike'),
    playlists: library.playlists.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      titles: playlist.items.map(toLibraryTitle),
    })),
  };
}

export function countsOf(library: LibraryResponse): LibraryCounts {
  const sections = sectionsOf(library);
  return {
    liked: sections.liked.length,
    disliked: sections.disliked.length,
    playlists: Object.fromEntries(
      sections.playlists.map((playlist) => [
        playlist.id,
        playlist.titles.length,
      ]),
    ),
  };
}

export function withRating(
  library: LibraryResponse,
  slug: string,
  rating: RatingState,
  snapshot: TitleSnapshot,
  now: string,
): LibraryResponse {
  const others = library.ratings.filter((row) => row.slug !== slug);
  if (rating === 'none') return { ...library, ratings: others };
  const row: LibraryRating = { slug, rating, ...snapshot, updatedAt: now };
  return { ...library, ratings: [row, ...others] };
}

export function withPlaylistItem(
  library: LibraryResponse,
  playlistId: string,
  slug: string,
  inPlaylist: boolean,
  snapshot: TitleSnapshot,
  now: string,
): LibraryResponse {
  const patch = (playlist: LibraryPlaylist): LibraryPlaylist => {
    if (playlist.id !== playlistId) return playlist;
    const others = playlist.items.filter((item) => item.slug !== slug);
    return {
      ...playlist,
      items: inPlaylist
        ? [{ slug, ...snapshot, addedAt: now }, ...others]
        : others,
    };
  };
  return { ...library, playlists: library.playlists.map(patch) };
}

export function withPlaylist(
  library: LibraryResponse,
  playlist: PlaylistSummary,
): LibraryResponse {
  if (library.playlists.some((existing) => existing.id === playlist.id)) {
    return library;
  }
  return {
    ...library,
    playlists: [...library.playlists, { ...playlist, items: [] }],
  };
}

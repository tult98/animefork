import { z } from 'zod';

export const DEFAULT_TMDB_API = 'https://api.themoviedb.org/3';

const SearchResultSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  original_name: z.string(),
  first_air_date: z.string().nullish(),
});

const SearchSchema = z.object({ results: z.array(SearchResultSchema) });

const MovieSearchResultSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  original_title: z.string(),
  release_date: z.string().nullish(),
  genre_ids: z.array(z.number().int()).default([]),
});

const MovieSearchSchema = z.object({
  results: z.array(MovieSearchResultSchema),
});

const ImageSchema = z.object({
  file_path: z.string().min(1),
  iso_639_1: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  vote_average: z.number(),
  vote_count: z.number(),
  width: z.number(),
  height: z.number(),
});

const ImagesSchema = z.object({
  backdrops: z.array(ImageSchema),
  posters: z.array(ImageSchema),
});

const DetailSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  original_name: z.string(),
  number_of_episodes: z.number().int(),
  first_air_date: z.string().nullish(),
  overview: z.string().nullish(),
  seasons: z
    .array(
      z.object({
        season_number: z.number().int(),
        episode_count: z.number().int(),
        air_date: z.string().nullish(),
      }),
    )
    .optional(),
});

const MovieDetailSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  original_title: z.string(),
  release_date: z.string().nullish(),
  overview: z.string().nullish(),
});

const SeasonSchema = z.object({
  episodes: z.array(
    z.object({
      episode_number: z.number().int(),
      still_path: z
        .string()
        .nullish()
        .transform((v) => v ?? null),
    }),
  ),
});

const AlternativeTitlesSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      iso_3166_1: z.string().nullish(),
      type: z.string().nullish(),
    }),
  ),
});

const MovieAlternativeTitlesSchema = z.object({
  titles: z.array(z.object({ title: z.string() })),
});

// TV and movie ids share one integer space, so an id names a TMDB record only together with its kind.
export type TmdbKind = 'tv' | 'movie';

export type TmdbSearchResult = z.infer<typeof SearchResultSchema>;
export type TmdbMovieSearchResult = z.infer<typeof MovieSearchResultSchema>;
export type TmdbImage = z.infer<typeof ImageSchema>;
export type TmdbImages = z.infer<typeof ImagesSchema>;
export type TmdbDetail = z.infer<typeof DetailSchema>;
export type TmdbMovieDetail = z.infer<typeof MovieDetailSchema>;
export type TmdbSeason = z.infer<typeof SeasonSchema>;

export class TmdbError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`TMDB ${path} answered ${status}`);
    this.name = 'TmdbError';
    this.status = status;
  }
}

export interface TmdbClient {
  searchTv(query: string): Promise<TmdbSearchResult[]>;
  tvImages(tvId: number): Promise<TmdbImages>;
  tvDetail(tvId: number, language?: string): Promise<TmdbDetail>;
  tvAlternativeTitles(tvId: number): Promise<string[]>;
  seasonDetail(tvId: number, season: number): Promise<TmdbSeason>;
  searchMovie(query: string): Promise<TmdbMovieSearchResult[]>;
  movieImages(movieId: number): Promise<TmdbImages>;
  movieDetail(movieId: number, language?: string): Promise<TmdbMovieDetail>;
  movieAlternativeTitles(movieId: number): Promise<string[]>;
}

export function createTmdbClient(options: {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}): TmdbClient {
  const base = (options.baseUrl ?? DEFAULT_TMDB_API).replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;

  async function get<T>(
    path: string,
    params: Record<string, string>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    const url = new URL(`${base}${path}`);
    url.searchParams.set('api_key', options.apiKey);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const res = await doFetch(url);
    if (!res.ok) throw new TmdbError(res.status, path);
    return schema.parse(await res.json());
  }

  return {
    searchTv: async (query) =>
      (await get('/search/tv', { query }, SearchSchema)).results,
    tvImages: (tvId) =>
      get(
        `/tv/${tvId}/images`,
        { include_image_language: 'vi,en,null' },
        ImagesSchema,
      ),
    tvDetail: (tvId, language) =>
      get(`/tv/${tvId}`, language ? { language } : {}, DetailSchema),
    tvAlternativeTitles: async (tvId) =>
      (
        await get(`/tv/${tvId}/alternative_titles`, {}, AlternativeTitlesSchema)
      ).results.map((r) => r.title),
    seasonDetail: (tvId, season) =>
      get(`/tv/${tvId}/season/${season}`, {}, SeasonSchema),
    searchMovie: async (query) =>
      (await get('/search/movie', { query }, MovieSearchSchema)).results,
    movieImages: (movieId) =>
      get(
        `/movie/${movieId}/images`,
        { include_image_language: 'vi,en,null' },
        ImagesSchema,
      ),
    movieDetail: (movieId, language) =>
      get(`/movie/${movieId}`, language ? { language } : {}, MovieDetailSchema),
    movieAlternativeTitles: async (movieId) =>
      (
        await get(
          `/movie/${movieId}/alternative_titles`,
          {},
          MovieAlternativeTitlesSchema,
        )
      ).titles.map((t) => t.title),
  };
}

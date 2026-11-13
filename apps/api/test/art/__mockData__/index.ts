// TMDB show 100 as `GET /tv/100` answers it: one season of 12 episodes and no overview.
// A test adds the overview of the language it asks for: `{ ...mockTmdbShow, overview: '...' }`.
export const mockTmdbShow = {
  id: 100,
  name: 'Tonikaku Kawaii',
  original_name: 'トニカクカワイイ',
  number_of_episodes: 12,
  first_air_date: '2020-10-03',
  seasons: [{ season_number: 1, episode_count: 12, air_date: '2020-10-03' }],
};

// The images of show 100: one English backdrop and one Vietnamese poster.
export const mockTmdbImages = {
  backdrops: [
    {
      file_path: '/backdrop-en.jpg',
      iso_639_1: 'en',
      vote_average: 5,
      vote_count: 3,
      width: 1920,
      height: 1080,
    },
  ],
  posters: [
    {
      file_path: '/poster-vi.jpg',
      iso_639_1: 'vi',
      vote_average: 4,
      vote_count: 2,
      width: 1000,
      height: 1500,
    },
  ],
};

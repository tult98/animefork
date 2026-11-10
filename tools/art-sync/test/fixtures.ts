// Hand-written from TMDB's documented response shapes. Unverified against the live API.
export const SEARCH_TONIKAWA = {
  page: 1,
  results: [
    {
      id: 100,
      name: 'Tonikaku Kawaii',
      original_name: 'トニカクカワイイ',
      first_air_date: '2020-10-03',
    },
    {
      id: 200,
      name: 'Completely Different Show',
      original_name: 'Other',
      first_air_date: '2015-01-01',
    },
  ],
};

export const SEARCH_NOTHING = { page: 1, results: [] };

export const DETAIL_100 = {
  id: 100,
  name: 'Tonikaku Kawaii',
  original_name: 'トニカクカワイイ',
  number_of_episodes: 24,
  first_air_date: '2020-10-03',
  seasons: [
    { season_number: 1, episode_count: 12, air_date: '2020-10-03' },
    { season_number: 2, episode_count: 12, air_date: '2023-04-01' },
  ],
};

export const DETAIL_200 = {
  id: 200,
  name: 'Completely Different Show',
  original_name: 'Other',
  number_of_episodes: 50,
  first_air_date: '2015-01-01',
  seasons: [{ season_number: 1, episode_count: 50, air_date: '2015-01-01' }],
};

export const IMAGES_100 = {
  id: 100,
  backdrops: [
    {
      file_path: '/textless.jpg',
      iso_639_1: null,
      vote_average: 9,
      vote_count: 50,
      width: 1920,
      height: 1080,
    },
    {
      file_path: '/en.jpg',
      iso_639_1: 'en',
      vote_average: 5,
      vote_count: 3,
      width: 1920,
      height: 1080,
    },
    {
      file_path: '/ja.jpg',
      iso_639_1: 'ja',
      vote_average: 10,
      vote_count: 90,
      width: 1920,
      height: 1080,
    },
  ],
};

export const SEASON_100_1 = {
  id: 1,
  episodes: [
    { episode_number: 1, still_path: '/e1.jpg' },
    { episode_number: 2, still_path: null },
    { episode_number: 3, still_path: '/e3.jpg' },
  ],
};

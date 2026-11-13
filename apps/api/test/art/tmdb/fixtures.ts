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
  posters: [
    {
      file_path: '/poster-en.jpg',
      iso_639_1: 'en',
      vote_average: 9,
      vote_count: 40,
      width: 2000,
      height: 3000,
    },
    {
      file_path: '/poster-vi.jpg',
      iso_639_1: 'vi',
      vote_average: 4,
      vote_count: 2,
      width: 1000,
      height: 1500,
    },
    {
      file_path: '/poster-ja.jpg',
      iso_639_1: 'ja',
      vote_average: 10,
      vote_count: 90,
      width: 2000,
      height: 3000,
    },
  ],
};

export const SEASON_100_1 = {
  id: 1,
  episodes: [
    {
      episode_number: 1,
      name: 'Fateful Meeting',
      overview: 'Nasa meets Tsukasa.',
      still_path: '/e1.jpg',
    },
    {
      episode_number: 2,
      name: 'Episode 2',
      overview: 'Nasa gặp lại Tsukasa.',
      still_path: null,
    },
    { episode_number: 3, name: 'Three', overview: '', still_path: '/e3.jpg' },
  ],
};

export const ALT_TITLES_100 = {
  id: 100,
  results: [
    { title: 'Tonikaku Kawaii', iso_3166_1: 'JP', type: 'Romaji' },
    { title: 'TONIKAWA', iso_3166_1: 'US', type: '' },
  ],
};

export const ALT_TITLES_200 = { id: 200, results: [] };

export const SEARCH_ROMAJI = {
  page: 1,
  results: [
    {
      id: 100,
      name: 'TONIKAWA: Over the Moon for You',
      original_name: 'トニカクカワイイ',
      first_air_date: '2020-10-03',
    },
  ],
};

export const CONAN_NAME = 'Thám Tử Lừng Danh Conan';

export const SEARCH_CONAN = {
  page: 1,
  results: [
    {
      id: 30983,
      name: 'Detective Conan',
      original_name: '名探偵コナン',
      first_air_date: '1996-01-08',
    },
    {
      id: 120089,
      name: "Detective Conan: Zero's Tea Time",
      original_name: '名探偵コナン ゼロの日常',
      first_air_date: '2022-04-05',
    },
  ],
};

export const DETAIL_30983 = {
  id: 30983,
  name: 'Detective Conan',
  original_name: '名探偵コナン',
  number_of_episodes: 1100,
  first_air_date: '1996-01-08',
  overview: 'A high school detective is shrunk into a child.',
  seasons: [{ season_number: 1, episode_count: 1100, air_date: '1996-01-08' }],
};

export const DETAIL_120089 = {
  id: 120089,
  name: "Detective Conan: Zero's Tea Time",
  original_name: '名探偵コナン ゼロの日常',
  number_of_episodes: 6,
  first_air_date: '2022-04-05',
  overview: null,
  seasons: [{ season_number: 1, episode_count: 6, air_date: '2022-04-05' }],
};

export const ALT_TITLES_30983 = {
  id: 30983,
  results: [
    { title: 'Meitantei Conan', iso_3166_1: 'JP', type: 'Romaji' },
    { title: 'Case Closed', iso_3166_1: 'US', type: '' },
  ],
};

export const CONAN_ROUTES: Record<string, unknown> = {
  [`/3/search/tv?${CONAN_NAME}`]: SEARCH_CONAN,
  '/3/tv/30983': DETAIL_30983,
  '/3/tv/120089': DETAIL_120089,
  '/3/tv/30983/alternative_titles': ALT_TITLES_30983,
  '/3/tv/120089/alternative_titles': { id: 120089, results: [] },
  '/3/tv/30983/images': IMAGES_100,
  '/3/tv/30983/season/1': SEASON_100_1,
};

// TMDB answers an empty overview string when a show has no translation in the requested language.
export const DETAIL_100_VI = {
  ...DETAIL_100,
  overview:
    'Nasa Yuzaki gặp Tsukasa trong một tai nạn và cầu hôn cô ngay tại chỗ.',
};

export const DETAIL_100_VI_EMPTY = { ...DETAIL_100, overview: '' };

export const DETAIL_100_EN = {
  ...DETAIL_100,
  overview:
    'Nasa Yuzaki meets Tsukasa in an accident and proposes to her on the spot.',
};

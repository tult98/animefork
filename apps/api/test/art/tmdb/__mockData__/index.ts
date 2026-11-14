// Tonikaku Kawaii on TMDB: show 100, two seasons of 12 episodes, the second aired in 2023.
export const mockTmdbDetail = {
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

// Detective Conan on TMDB: show 30983, one season of 1100 episodes, no name close to the Vietnamese title.
export const mockTmdbConan = {
  id: 30983,
  name: 'Detective Conan',
  original_name: '名探偵コナン',
  number_of_episodes: 1100,
  first_air_date: '1996-01-08',
  overview: 'A high school detective is shrunk into a child.',
  seasons: [{ season_number: 1, episode_count: 1100, air_date: '1996-01-08' }],
};

// The Japanese images have the most votes. The best backdrop left is English, the best poster is Vietnamese.
export const mockTmdbImages = {
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

export const mockJevReply = {
  model: 'jev-1.13.0',
  answers: {
    match: {
      type: 'choice',
      choice: 'tv:30983',
      confidence: 0.8,
      probabilities: { 'tv:30983': 0.92 },
    },
    any_match: { type: 'noul', noul: 0.96 },
    show_match: {
      type: 'choice',
      choice: 'tv:30983',
      confidence: 0.8,
      probabilities: { 'tv:30983': 0.92 },
    },
    any_show: { type: 'noul', noul: 0.96 },
    side_entry: { type: 'noul', noul: 0.05 },
  },
  usage: { input_tokens: 400, output_tokens: 30 },
};

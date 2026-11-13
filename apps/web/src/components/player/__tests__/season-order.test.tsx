// @vitest-environment jsdom
import fetchMock from '@fetch-mock/vitest';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOCK_WATCH_SLUG,
  mockWatchHtml,
} from '../../../lib/titles/__mockData__/index.ts';
import { render, screen, waitFor } from '../../../test/test-utils.tsx';
import { WatchScreen } from '../watch-screen.tsx';

// Upstream lists the seasons as Special, TV Series (the one playing), then 2.
// The page being watched is a later season, whose marker must not be sent for its siblings.
const html = mockWatchHtml
  .replace(
    /<h1 class="Title">.*?<\/h1>/,
    '<h1 class="Title">Tonikaku Kawaii 2nd Season</h1>',
  )
  .replace(
    /<div class="season_item">.*?<\/div>/s,
    `<div class="season_item"><a href="https://animevietsub.cc/phim/special-a1/">Special</a><a href="https://animevietsub.cc/phim/tonikaku-kawaii-a3860/" class="active">TV Series</a><a href="https://animevietsub.cc/phim/season-2-a3/">2</a></div>`,
  );

const unscored = {
  id: 1,
  score: null,
  voters: null,
  rank: null,
  popularity: null,
  members: null,
  airing: null,
  episodes: null,
};

const seasonLookup = {
  titles: [
    { slug: 'special-a1', name: 'Tonikaku Kawaii' },
    { slug: 'tonikaku-kawaii-a3860', name: 'Tonikaku Kawaii' },
    { slug: 'season-2-a3', name: 'Tonikaku Kawaii' },
  ],
};

async function openSeasonPicker() {
  render(<WatchScreen slug={MOCK_WATCH_SLUG} />, { path: '/' });
  await userEvent.click(await screen.findByTestId('player:seasons-back'));
  return screen.getByTestId('player:seasons-panel');
}

function pickerOrder(panel: HTMLElement) {
  return [...panel.querySelectorAll('button')].map((b) => b.textContent);
}

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test');
  fetchMock
    .get('path:/v1/auth/me', 401)
    .get('path:/phim/tonikaku-kawaii-a3860/xem-phim.html', html)
    .get('path:/v1/episodes/tonikaku-kawaii-a3860', { status: 'ready' })
    .get('begin:https://api.test/v1/skip-times/', { segments: [] });
});

describe('the season picker', () => {
  it('lists the seasons by MyAnimeList start date, reading a year or month alone as the first day', async () => {
    fetchMock.post('path:/v1/art/lookup', {
      art: {},
      ratings: {
        'special-a1': { mal: { ...unscored, startDate: '2021-04' } },
        'tonikaku-kawaii-a3860': { mal: { ...unscored, startDate: '2019' } },
        'season-2-a3': { mal: { ...unscored, startDate: '2019-10-04' } },
      },
    });
    const panel = await openSeasonPicker();
    await expect(fetchMock).toBeFetched('path:/v1/art/lookup', {
      method: 'post',
      body: seasonLookup,
    });

    await waitFor(() =>
      expect(pickerOrder(panel)).toEqual(['TV Series', '2', 'Special']),
    );
  });

  it('keeps a season without a date in its place', async () => {
    fetchMock.post('path:/v1/art/lookup', {
      art: {},
      ratings: {
        'tonikaku-kawaii-a3860': {
          mal: { ...unscored, startDate: '2022-01-01' },
        },
        'season-2-a3': { mal: { ...unscored, startDate: '2020-01-01' } },
      },
    });
    const panel = await openSeasonPicker();
    await expect(fetchMock).toBeFetched('path:/v1/art/lookup', {
      method: 'post',
      body: seasonLookup,
    });

    await waitFor(() =>
      expect(pickerOrder(panel)).toEqual(['Special', '2', 'TV Series']),
    );
  });

  it('keeps the upstream order when the lookup fails', async () => {
    fetchMock.post('path:/v1/art/lookup', 500);
    const panel = await openSeasonPicker();
    await expect(fetchMock).toBeFetched('path:/v1/art/lookup', {
      method: 'post',
      body: seasonLookup,
    });

    expect(pickerOrder(panel)).toEqual(['Special', 'TV Series', '2']);
  });
});

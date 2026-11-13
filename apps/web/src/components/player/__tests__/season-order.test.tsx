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

function pageWith(seasons: [slug: string, label: string][]) {
  const links = seasons
    .map(
      ([slug, label]) =>
        `<a href="https://animevietsub.cc/phim/${slug}/"${slug === 'tonikaku-kawaii-a3860' ? ' class="active"' : ''}>${label}</a>`,
    )
    .join('');
  return mockWatchHtml
    .replace(
      /<h1 class="Title">.*?<\/h1>/,
      '<h1 class="Title">Tonikaku Kawaii 2nd Season</h1>',
    )
    .replace(
      /<div class="season_item">.*?<\/div>/s,
      `<div class="season_item">${links}</div>`,
    );
}

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
    .get('path:/v1/episodes/tonikaku-kawaii-a3860', { status: 'ready' })
    .get('begin:https://api.test/v1/skip-times/', { segments: [] });
});

describe('the season picker', () => {
  it('lists the main line by MyAnimeList start date, then the side entries in source order', async () => {
    fetchMock
      .get(
        'path:/phim/tonikaku-kawaii-a3860/xem-phim.html',
        pageWith([
          ['special-a1', 'Special'],
          ['tonikaku-kawaii-a3860', 'TV Series'],
          ['movie-a2', 'Movie'],
          ['season-2-a3', '2'],
        ]),
      )
      .post('path:/v1/art/lookup', {
        art: {},
        ratings: {
          'special-a1': { mal: { ...unscored, startDate: '2021-04' } },
          'tonikaku-kawaii-a3860': { mal: { ...unscored, startDate: '2019' } },
          'movie-a2': { mal: { ...unscored, startDate: '2020-01-01' } },
          'season-2-a3': { mal: { ...unscored, startDate: '2019-10-04' } },
        },
      });
    const panel = await openSeasonPicker();
    await expect(fetchMock).toBeFetched('path:/v1/art/lookup', {
      method: 'post',
      body: {
        titles: [
          { slug: 'special-a1', name: 'Tonikaku Kawaii' },
          { slug: 'tonikaku-kawaii-a3860', name: 'Tonikaku Kawaii' },
          { slug: 'movie-a2', name: 'Tonikaku Kawaii' },
          { slug: 'season-2-a3', name: 'Tonikaku Kawaii' },
        ],
      },
    });

    await waitFor(() =>
      expect(pickerOrder(panel)).toEqual([
        'TV Series',
        '2',
        'Special',
        'Movie',
      ]),
    );
  });

  it('keeps a main line season without a date in its place', async () => {
    fetchMock
      .get(
        'path:/phim/tonikaku-kawaii-a3860/xem-phim.html',
        pageWith([
          ['tonikaku-kawaii-a3860', 'TV Series'],
          ['season-3-a4', '3'],
          ['season-2-a3', '2'],
        ]),
      )
      .post('path:/v1/art/lookup', {
        art: {},
        ratings: {
          'season-3-a4': { mal: { ...unscored, startDate: '2022-01-01' } },
          'season-2-a3': { mal: { ...unscored, startDate: '2020-01-01' } },
        },
      });
    const panel = await openSeasonPicker();
    await expect(fetchMock).toBeFetched('path:/v1/art/lookup', {
      method: 'post',
      body: {
        titles: [
          { slug: 'tonikaku-kawaii-a3860', name: 'Tonikaku Kawaii' },
          { slug: 'season-3-a4', name: 'Tonikaku Kawaii' },
          { slug: 'season-2-a3', name: 'Tonikaku Kawaii' },
        ],
      },
    });

    await waitFor(() =>
      expect(pickerOrder(panel)).toEqual(['TV Series', '2', '3']),
    );
  });

  it('still groups the side entries last when the lookup fails', async () => {
    fetchMock
      .get(
        'path:/phim/tonikaku-kawaii-a3860/xem-phim.html',
        pageWith([
          ['special-a1', 'Special'],
          ['tonikaku-kawaii-a3860', 'TV Series'],
          ['movie-a2', 'Movie'],
          ['season-2-a3', '2'],
        ]),
      )
      .post('path:/v1/art/lookup', 500);
    const panel = await openSeasonPicker();
    await expect(fetchMock).toBeFetched('path:/v1/art/lookup', {
      method: 'post',
      body: {
        titles: [
          { slug: 'special-a1', name: 'Tonikaku Kawaii' },
          { slug: 'tonikaku-kawaii-a3860', name: 'Tonikaku Kawaii' },
          { slug: 'movie-a2', name: 'Tonikaku Kawaii' },
          { slug: 'season-2-a3', name: 'Tonikaku Kawaii' },
        ],
      },
    });

    expect(pickerOrder(panel)).toEqual(['TV Series', '2', 'Special', 'Movie']);
  });
});

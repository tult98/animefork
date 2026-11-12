// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FixtureOverride } from '../../test/fixture-fetch.ts';
import {
  cards,
  current,
  openListing,
  order,
  pick,
} from '../../test/listing.ts';
import { stubLookup } from '../../test/lookup-stub.ts';

const PAGE = '/upcoming';
const FIRST =
  'sekai-saikou-no-ansatsusha-isekai-kizoku-ni-tensei-suru-2nd-season-a6188';
const LAST =
  'tokidoki-bosotto-russia-go-de-dereru-tonari-no-alya-san-2nd-season-a5457';
const COUNTDOWN =
  'doukyo-shiteiru-kensei-no-onna-shishou-ga-kawaisugite-mainichi-shiawase-desu-a6174';
const BARE_YEAR = FIRST;
const TOTAL = 30 + 17;
const NOW = new Date('2026-11-11T12:00:00Z');

const card = (slug: string) => screen.getByTestId(`card:/phim/${slug}/`);

describe('the upcoming listing', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('lists every page of the source 30 at a time and reaches the last card', async () => {
    const bodies = stubLookup();
    await openListing(PAGE);
    expect(cards()).toHaveLength(30);
    expect(screen.getByTestId('listing:count').textContent).toContain(
      `${TOTAL}`,
    );
    expect(screen.queryByTestId('listing:partial')).toBeNull();
    expect(bodies.flatMap((b) => b.titles)).toHaveLength(TOTAL);
    expect(order()[0]).toBe(FIRST);

    await userEvent.click(screen.getByTestId('listing:page:2'));
    await waitFor(() => expect(current()).toBe('2'));
    expect(order()).toHaveLength(TOTAL - 30);
    expect(order().at(-1)).toBe(LAST);
  });

  it('requests both pages of /anime-sap-chieu/', async () => {
    stubLookup();
    const requested: string[] = [];
    const record: FixtureOverride = (url) => {
      requested.push(url);
      return undefined;
    };
    await openListing(PAGE, { overrides: [record] });
    expect(requested).toContain('/fixtures/default/anime-sap-chieu.html');
    expect(requested).toContain(
      '/fixtures/default/anime-sap-chieu/trang-2.html',
    );
  });

  it('shows a countdown on a timer card and the year on a bare-year card, both under Sắp chiếu', async () => {
    stubLookup();
    await openListing(PAGE);

    const timer = card(COUNTDOWN);
    expect(within(timer).getByTestId('card:countdown').textContent).toBe(
      'Hôm nay',
    );
    expect(timer.textContent).toContain('Sắp chiếu');

    const bare = card(BARE_YEAR);
    expect(bare.textContent).toContain('Sắp chiếu');
    expect(within(bare).getByTestId('card:countdown').textContent).toBe('2027');
  });

  it('sorting by views reorders the list and returns to page 1', async () => {
    stubLookup();
    const { router } = await openListing(`${PAGE}?page=2`);
    expect(current()).toBe('2');

    await pick('views-desc');
    await waitFor(() => expect(current()).toBe('1'));
    expect(router.state.location.search).toMatchObject({ sort: 'views-desc' });
    expect(screen.getByTestId('listing:sort').textContent).toBe(
      'Xem nhiều nhất',
    );
    expect(order()[0]).not.toBe(FIRST);
  });

  it('a direct URL opens that page', async () => {
    stubLookup();
    await openListing(`${PAGE}?page=2`);
    expect(current()).toBe('2');
    expect(cards()).toHaveLength(TOTAL - 30);
    expect(screen.getByTestId('listing:next')).toHaveProperty('disabled', true);
  });
});

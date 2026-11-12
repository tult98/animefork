// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ArtEntry,
  LookupRequest,
} from '../../../../api/src/art/contract.ts';
import { advance, withFakeClock } from '../../test/clock.ts';
import { openListing } from '../../test/listing.ts';
import { stubArt } from '../../test/lookup-stub.ts';
import { renderApp } from '../../test/render-app.tsx';
import { watchSourceImages } from '../../test/watch-images.ts';

const HERO_SLUG =
  'shinja-zero-no-megami-sama-to-hajimeru-isekai-kouryaku-a6137';
const SOURCE = /^https:\/\/cdn\.animevietsub\.best\//;
const TMDB = 'https://image.tmdb.org/t/p';

const readyAll = (body: LookupRequest): Record<string, ArtEntry> =>
  Object.fromEntries(
    body.titles.map((t) => [
      t.slug,
      {
        status: 'ready',
        backdropPath: `/${t.slug}.jpg`,
        backdropLang: 'vi',
        posterPath: `/${t.slug}-p.jpg`,
      },
    ]),
  );

const pendingAll = (body: LookupRequest): Record<string, ArtEntry> =>
  Object.fromEntries(body.titles.map((t) => [t.slug, { status: 'pending' }]));

const gate = () => {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => (open = resolve));
  return { promise, open: () => open() };
};

const heroImg = () => screen.getByTestId('hero:slide:0').querySelector('img');
// Slide 0 is the one the answers name, so wait for its own skeleton, not another slide's.
const slideSkeleton = async () =>
  within(await screen.findByTestId('hero:slide:0')).findByTestId(
    'hero:art-skeleton',
  );

const src = (el: Element | null) => el?.getAttribute('src') ?? null;
const shelfImgs = (id: string) =>
  screen.getByTestId(`shelf:${id}`).querySelectorAll('img');

withFakeClock();

// Skeletons come and go as the later shelves and their lookups land, so wait for the page to settle.
const noSkeletons = () =>
  waitFor(() => {
    expect(screen.queryAllByTestId('hero:art-skeleton')).toHaveLength(0);
    expect(screen.queryAllByTestId('card:art-skeleton')).toHaveLength(0);
  });

let watcher: ReturnType<typeof watchSourceImages> | undefined;
afterEach(() => watcher?.stop());

describe('the art skeleton', () => {
  it('shows skeletons on a held lookup, then only TMDB art, with no source image in between', async () => {
    watcher = watchSourceImages(
      '[data-testid^="hero:slide"], [data-testid^="card:/phim/"]',
    );
    const held = gate();
    stubArt(readyAll, {}, { gate: held.promise });
    await renderApp('/');
    await slideSkeleton();
    const shelf = await screen.findByTestId('shelf:new-episodes');
    expect(
      shelf.querySelector('[data-testid="card:art-skeleton"]'),
    ).not.toBeNull();
    expect(shelf.querySelectorAll('img')).toHaveLength(0);
    expect(heroImg()).toBeNull();
    expect(
      shelf.querySelector('[data-cover]')!.getAttribute('aria-label'),
    ).toMatch(/.+/);

    held.open();
    await waitFor(() =>
      expect(src(heroImg())).toBe(`${TMDB}/original/${HERO_SLUG}.jpg`),
    );
    await noSkeletons();
    expect(src(shelfImgs('new-episodes')[0]!)).toMatch(
      /^https:\/\/image\.tmdb\.org\/t\/p\/w780\//,
    );
    expect(watcher.seen).toEqual([]);
  });

  it('keeps the skeleton through a pending answer and never shows the source image', async () => {
    watcher = watchSourceImages('[data-testid="hero:slide:0"]');
    let ready = false;
    const bodies = stubArt((body) =>
      ready ? readyAll(body) : { [HERO_SLUG]: { status: 'pending' } },
    );
    await renderApp('/');
    await slideSkeleton();
    expect(bodies.length).toBeGreaterThan(0);
    expect(heroImg()).toBeNull();

    ready = true;
    await advance(3_000);
    await waitFor(() =>
      expect(src(heroImg())).toBe(`${TMDB}/original/${HERO_SLUG}.jpg`),
    );
    expect(watcher.seen).toEqual([]);
  });

  it('shows the source image at once for a title the answer calls none', async () => {
    stubArt(() => ({ [HERO_SLUG]: { status: 'none' } }));
    await renderApp('/');
    await waitFor(() => expect(src(heroImg())).toMatch(SOURCE));
    await noSkeletons();
  });

  it('ends the skeletons and shows the source images when the lookup fails', async () => {
    stubArt(() => ({}), {}, { status: 500 });
    await renderApp('/');
    await waitFor(() => expect(src(heroImg())).toMatch(SOURCE));
    await waitFor(() =>
      expect(src(shelfImgs('new-episodes')[0]!)).toMatch(SOURCE),
    );
    await noSkeletons();
  });

  it('falls back to the source image when a title is still pending after the last poll', async () => {
    const bodies = stubArt(() => ({ [HERO_SLUG]: { status: 'pending' } }));
    await renderApp('/');
    await slideSkeleton();
    // Once the season has landed every set of titles is in flight, so the polls below spend each budget.
    await screen.findByTestId('shelf:upcoming');
    await advance(3_000);
    await waitFor(() => expect(src(heroImg())).toMatch(SOURCE));
    await noSkeletons();

    await advance(6_000);
    await advance(12_000);
    const spent = bodies.length;
    await advance(60_000);
    expect(bodies).toHaveLength(spent);
  });

  describe('on a listing', () => {
    it('waits on a held lookup, then shows only TMDB art', async () => {
      watcher = watchSourceImages('[data-testid="listing:grid"]');
      const held = gate();
      const bodies = stubArt(readyAll, {}, { gate: held.promise });
      await renderApp('/airing-this-season');
      const grid = await screen.findByTestId('listing:grid');
      expect(
        grid.querySelector('[data-testid="card:art-skeleton"]'),
      ).not.toBeNull();
      expect(grid.querySelectorAll('img')).toHaveLength(0);
      await waitFor(() => expect(bodies).toHaveLength(1));

      held.open();
      await waitFor(() =>
        expect(src(grid.querySelector('img'))).toMatch(
          /^https:\/\/image\.tmdb\.org\/t\/p\/w780\//,
        ),
      );
      await noSkeletons();
      expect(watcher.seen).toEqual([]);
    });

    it('falls back to the source image once the poll budget is spent', async () => {
      stubArt(pendingAll);
      await openListing('/airing-this-season');
      const grid = screen.getByTestId('listing:grid');
      await advance(3_000);
      await waitFor(() =>
        expect(src(grid.querySelector('img'))).toMatch(SOURCE),
      );
      await noSkeletons();
    });
  });

  it('never waits or calls the lookup when no API is configured', async () => {
    vi.stubEnv('VITE_API_URL', '');
    const lookups: string[] = [];
    const real = globalThis.fetch;
    globalThis.fetch = ((input, init) => {
      lookups.push(String(input));
      return real(input, init);
    }) as typeof fetch;
    try {
      await renderApp('/');
      await screen.findByTestId('shelf:upcoming');
      await waitFor(() => expect(src(heroImg())).toMatch(SOURCE));
      await noSkeletons();
      expect(lookups.filter((url) => url.includes('/v1/art/lookup'))).toEqual(
        [],
      );
    } finally {
      globalThis.fetch = real;
    }
  });
});

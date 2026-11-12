// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArtEntry } from '../../../../api/src/art/contract.ts';
import { advance, withFakeClock } from '../../test/clock.ts';
import { openListing } from '../../test/listing.ts';
import { mal, stubArt } from '../../test/lookup-stub.ts';
import { renderApp } from '../../test/render-app.tsx';

const HERO_SLUG =
  'shinja-zero-no-megami-sama-to-hajimeru-isekai-kouryaku-a6137';
const TOP10_SLUG = 'black-clover-2nd-season-a6073';
const TMDB = 'https://image.tmdb.org/t/p';
const SOURCE = /^https:\/\/cdn\.animevietsub\.best\//;

const ready = (
  backdropPath: string,
  posterPath: string | null = null,
): ArtEntry => ({
  status: 'ready',
  backdropPath,
  backdropLang: 'vi',
  posterPath,
});

const heroImg = (slide = 0) =>
  screen.getByTestId(`hero:slide:${slide}`).querySelector('img');
// Slide 0 is the one the answers name, so wait for its own skeleton, not another slide's.
const slideSkeleton = async () =>
  within(await screen.findByTestId('hero:slide:0')).findByTestId(
    'hero:art-skeleton',
  );

const src = (el: Element | null) => el?.getAttribute('src') ?? null;

describe('art on the home page', () => {
  it('puts a TMDB backdrop on the stubbed slide and keeps the source image on the others', async () => {
    const bodies = stubArt(() => ({ [HERO_SLUG]: ready('/hero.jpg') }));
    await renderApp('/');
    await screen.findByTestId('hero');
    await waitFor(() =>
      expect(src(heroImg(0))).toBe(`${TMDB}/original/hero.jpg`),
    );
    expect(heroImg(1)!.getAttribute('src')).toMatch(SOURCE);
    expect(
      within(screen.getByTestId('hero:slide:0')).getByTestId('hero:description')
        .textContent,
    ).toMatch(/\.\.\.$/);

    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body.episodes).toBeUndefined();
      expect(body.titles.length).toBeLessThanOrEqual(50);
      expect(body.titles.map((t) => t.slug)).toContain(HERO_SLUG);
    }
  });

  it('shows the stored overview, and the source excerpt where the answer has none', async () => {
    const overview =
      'Nasa Yuzaki gặp Tsukasa trong một tai nạn và cầu hôn cô ngay tại chỗ.';
    stubArt((body) =>
      Object.fromEntries(
        body.titles.map((t) => [
          t.slug,
          {
            ...ready(`/${t.slug}.jpg`),
            overview: t.slug === HERO_SLUG ? overview : null,
            overviewTranslated: t.slug === HERO_SLUG,
          },
        ]),
      ),
    );
    await renderApp('/');
    await screen.findByTestId('hero');
    await waitFor(() =>
      expect(src(heroImg(0))).toBe(`${TMDB}/original/${HERO_SLUG}.jpg`),
    );
    const first = within(screen.getByTestId('hero:slide:0')).getByTestId(
      'hero:description',
    );
    expect(first.textContent).toBe(overview);
    expect(
      within(screen.getByTestId('hero:slide:1')).getByTestId('hero:description')
        .textContent,
    ).toMatch(/\.\.\.$/);
  });

  describe('polling', () => {
    withFakeClock();

    it('swaps in the backdrop after a pending answer, then stops polling', async () => {
      let late = false;
      const bodies = stubArt(() => ({
        [HERO_SLUG]: late ? ready('/late.jpg') : { status: 'pending' },
      }));
      await renderApp('/');
      await slideSkeleton();
      expect(heroImg(0)).toBeNull();

      late = true;
      await advance(2_000);
      expect(heroImg(0)).toBeNull();
      await advance(2_000);
      // The clock also ticks with real time, so a short timeout leaves no room for a poll that is late.
      await waitFor(
        () => expect(src(heroImg(0))).toBe(`${TMDB}/original/late.jpg`),
        { timeout: 500 },
      );
      const settled = bodies.length;
      await advance(60_000);
      expect(bodies).toHaveLength(settled);
    });
  });

  it('puts the TMDB poster on a top 10 card and keeps the source poster for the others', async () => {
    const bodies = stubArt(() => ({
      [TOP10_SLUG]: ready('/top.jpg', '/top-poster.jpg'),
    }));
    await renderApp('/');
    const shelf = await screen.findByTestId('shelf:top-10-today');
    await waitFor(() =>
      expect(bodies.flatMap((b) => b.titles.map((t) => t.slug))).toContain(
        TOP10_SLUG,
      ),
    );
    const items = within(shelf).getAllByRole('listitem');
    await waitFor(() =>
      expect(src(items[0]!.querySelector('.af-poster-art img'))).toBe(
        `${TMDB}/w342/top-poster.jpg`,
      ),
    );
    expect(src(items[1]!.querySelector('.af-poster-art img'))).toMatch(
      /^https:\/\/cdn\.animevietsub\.best\/data\/poster\//,
    );
  });

  it('keeps the source poster when the answer has no posterPath', async () => {
    const bodies = stubArt(() => ({ [TOP10_SLUG]: ready('/top.jpg') }));
    await renderApp('/');
    const shelf = await screen.findByTestId('shelf:top-10-today');
    await waitFor(() => expect(bodies.length).toBeGreaterThan(0));
    const first = within(shelf).getAllByRole('listitem')[0]!;
    await waitFor(() =>
      expect(src(first.querySelector('.af-poster-art img'))).toMatch(
        /^https:\/\/cdn\.animevietsub\.best\/data\/poster\//,
      ),
    );
  });

  it('keeps the source images when the art API fails', async () => {
    stubArt(() => ({}), {}, { status: 500 });
    await renderApp('/');
    await screen.findByTestId('hero');
    await waitFor(() =>
      expect(heroImg(0)!.getAttribute('src')).toMatch(SOURCE),
    );
  });

  it('makes the upcoming tags precise from MAL start dates and reorders the shelf', async () => {
    const base = {
      ...mal(null, null).mal!,
      airing: 'not_yet_aired' as const,
    };
    stubArt(() => ({}), {
      'akatsuki-no-ryuu-a7009': {
        mal: { ...base, startSeason: { year: 2027, season: 'winter' } },
      },
      'minato-machi-diary-a7010': { mal: { ...base, startDate: '2027-01' } },
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-11T12:00:00Z'));
    try {
      await renderApp('/');
      const shelf = await screen.findByTestId('shelf:upcoming');
      await waitFor(() =>
        expect(
          within(shelf)
            .getAllByTestId('card:countdown')
            .map((tag) => tag.textContent),
        ).toEqual([
          'Hôm nay',
          'Còn 5 ngày',
          'Còn 2 tuần',
          'Mùa đông 2027',
          '2027',
          '1/2027',
          'Còn 3 tháng',
          '2029',
          '2030',
          '2099',
        ]),
      );
      expect(
        within(shelf)
          .getByTestId('card:/phim/minato-machi-diary-a7010/')
          .querySelector('[data-cover]')!
          .getAttribute('aria-label'),
      ).toBe('Minato Machi Diary, PV/??, 1/2027');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('art on a listing', () => {
  it('shows the TMDB art once the lookup answers', async () => {
    stubArt((body) =>
      Object.fromEntries(
        body.titles.map((t) => [
          t.slug,
          ready(`/${t.slug}.jpg`, `/${t.slug}-p.jpg`),
        ]),
      ),
    );
    await openListing('/airing-this-season');
    const grid = screen.getByTestId('listing:grid');
    await waitFor(() =>
      expect(src(grid.querySelector('img'))).toMatch(
        /^https:\/\/image\.tmdb\.org\/t\/p\//,
      ),
    );
  });
});

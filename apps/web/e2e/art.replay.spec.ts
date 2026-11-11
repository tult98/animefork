import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page, Route } from '@playwright/test';
import type {
  ArtEntry,
  LookupRequest,
  TitleRatings,
} from '../../api/src/art/contract.ts';
import { expect, test, UPCOMING_NOW } from './fixtures.ts';

const SLUG = 'tonikaku-kawaii-a3860';
const HERO_SLUG =
  'shinja-zero-no-megami-sama-to-hajimeru-isekai-kouryaku-a6137';
const TOP10_SLUG = 'black-clover-2nd-season-a6073';
const LOOKUP = '**/api.test/v1/art/lookup';
const poster = readFileSync(
  resolve(import.meta.dirname, '../public/fixtures/poster.svg'),
);

async function stubArt(
  page: Page,
  answer: (body: LookupRequest, call: number) => Record<string, ArtEntry>,
  ratings: Record<string, TitleRatings> = {},
): Promise<LookupRequest[]> {
  await page.route('**/image.tmdb.org/**', (route) =>
    route.fulfill({ contentType: 'image/svg+xml', body: poster }),
  );
  const bodies: LookupRequest[] = [];
  await page.route(LOOKUP, (route: Route) => {
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON() as LookupRequest;
    bodies.push(body);
    return route.fulfill({
      json: { art: answer(body, bodies.length), ratings },
    });
  });
  return bodies;
}

const ready = (
  backdropPath: string,
  stills?: Record<string, string>,
  posterPath: string | null = null,
) =>
  ({
    status: 'ready',
    backdropPath,
    backdropLang: 'vi',
    posterPath,
    ...(stills ? { stills } : {}),
  }) as const;

test('TMDB episode stills replace the source thumbnail where a still exists', async ({
  page,
}) => {
  const bodies = await stubArt(page, () => ({
    [SLUG]: ready('/backdrop.jpg', { '3': '/e3.jpg' }),
  }));

  await page.goto(`/watch/${SLUG}?transport=replay`);
  await expect(page.getByTestId('player')).toBeVisible();
  await page.getByTestId('player:episodes').hover();
  await expect(page.getByTestId('player:episodes-panel')).toBeVisible();

  await page.getByTestId('episode:3:toggle').click();
  await expect(
    page.getByTestId('episode:3:play').locator('img'),
  ).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w300/e3.jpg');

  await page.getByTestId('episode:2:toggle').click();
  await expect(
    page.getByTestId('episode:2:play').locator('img'),
  ).toHaveAttribute('src', 'https://image.tmdb.org/t/p/original/backdrop.jpg');

  expect(bodies[0]).toEqual({
    titles: [{ slug: SLUG, name: 'Tonikaku Kawaii' }],
    episodes: true,
  });
});

test('the watch page swaps in the stills once a pending title is ready', async ({
  page,
}) => {
  const bodies = await stubArt(page, (_, call) => ({
    [SLUG]:
      call === 1 ? { status: 'pending' } : ready('/b.jpg', { '3': '/e3.jpg' }),
  }));

  await page.goto(`/watch/${SLUG}?transport=replay`);
  await expect(page.getByTestId('player')).toBeVisible();
  await page.getByTestId('player:episodes').hover();
  await page.getByTestId('episode:3:toggle').click();
  await expect(
    page.getByTestId('episode:3:play').locator('img'),
  ).toHaveAttribute('src', 'https://image.tmdb.org/t/p/w300/e3.jpg', {
    timeout: 10_000,
  });
  expect(bodies).toHaveLength(2);
});

test('the home hero shows a TMDB backdrop for a stubbed slug and keeps the source image for the others', async ({
  page,
}) => {
  const bodies = await stubArt(page, () => ({
    [HERO_SLUG]: ready('/hero.jpg'),
  }));

  await page.goto('/?transport=replay');
  await expect(page.getByTestId('hero:slide:0').locator('img')).toHaveAttribute(
    'src',
    'https://image.tmdb.org/t/p/original/hero.jpg',
  );
  await expect(
    page.getByTestId('hero:slide:0').getByTestId('hero:description'),
  ).toHaveText(/\.\.\.$/);
  await expect(page.getByTestId('hero:slide:1').locator('img')).toHaveAttribute(
    'src',
    /^https:\/\/cdn\.animevietsub\.best\//,
  );

  expect(bodies.length).toBeGreaterThan(0);
  for (const body of bodies) {
    expect(body.episodes).toBeUndefined();
    expect(body.titles.length).toBeLessThanOrEqual(50);
    expect(body.titles.map((t) => t.slug)).toContain(HERO_SLUG);
  }
});

test('the home hero shows the stored overview, and the source excerpt where the answer has none', async ({
  page,
}) => {
  const overview =
    'Nasa Yuzaki gặp Tsukasa trong một tai nạn và cầu hôn cô ngay tại chỗ.';
  await stubArt(page, (body) =>
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

  await page.goto('/?transport=replay');
  const first = page.getByTestId('hero:slide:0');
  await expect(first.locator('img')).toHaveAttribute(
    'src',
    `https://image.tmdb.org/t/p/original/${HERO_SLUG}.jpg`,
  );
  await expect(first.getByTestId('hero:description')).toHaveText(overview);
  await expect(first.getByTestId('hero:description')).toHaveClass(
    /line-clamp-2/,
  );
  await expect(
    page.getByTestId('hero:slide:1').getByTestId('hero:description'),
  ).toHaveText(/\.\.\.$/);
});

test('the home hero swaps in the backdrop after a pending answer, then stops polling', async ({
  page,
}) => {
  const bodies = await stubArt(page, (_, call) => ({
    [HERO_SLUG]: call === 1 ? { status: 'pending' } : ready('/late.jpg'),
  }));

  await page.goto('/?transport=replay');
  const hero = page.getByTestId('hero:slide:0').locator('img');
  await expect(hero).toHaveAttribute(
    'src',
    /^https:\/\/cdn\.animevietsub\.best\//,
  );
  await expect(hero).toHaveAttribute(
    'src',
    'https://image.tmdb.org/t/p/original/late.jpg',
    { timeout: 10_000 },
  );
  const settled = bodies.length;
  await page.waitForTimeout(4_000);
  expect(bodies).toHaveLength(settled);
});

test('a top 10 card shows the TMDB poster and its hover preview the backdrop', async ({
  page,
}) => {
  const bodies = await stubArt(page, () => ({
    [TOP10_SLUG]: ready('/top.jpg', undefined, '/top-poster.jpg'),
  }));

  await page.goto('/?transport=replay');
  const items = page.getByTestId('shelf:top-10-today').getByRole('listitem');
  const first = items.nth(0);
  const second = items.nth(1);
  await expect(first).toBeVisible();

  await expect
    .poll(() => bodies.flatMap((b) => b.titles.map((t) => t.slug)))
    .toContain(TOP10_SLUG);

  const previewImg = page.locator('[data-testid$=":preview"] img');
  await expect(first.locator('.af-poster-art img')).toHaveAttribute(
    'src',
    'https://image.tmdb.org/t/p/w342/top-poster.jpg',
  );
  await first.locator('[data-cover]').hover();
  await expect(previewImg).toHaveAttribute(
    'src',
    'https://image.tmdb.org/t/p/w780/top.jpg',
  );

  await page.mouse.move(5, 5);
  await expect(previewImg).toHaveCount(0);

  await expect(second.locator('.af-poster-art img')).toHaveAttribute(
    'src',
    /^https:\/\/cdn\.animevietsub\.best\/data\/poster\//,
  );
  await second.locator('[data-cover]').hover();
  await expect(previewImg).toHaveAttribute(
    'src',
    /^https:\/\/cdn\.animevietsub\.best\//,
  );
});

test('a top 10 title without a posterPath keeps the source poster in its card', async ({
  page,
}) => {
  const bodies = await stubArt(page, () => ({
    [TOP10_SLUG]: ready('/top.jpg'),
  }));

  await page.goto('/?transport=replay');
  const first = page
    .getByTestId('shelf:top-10-today')
    .getByRole('listitem')
    .nth(0);
  await expect
    .poll(() => bodies.flatMap((b) => b.titles.map((t) => t.slug)))
    .toContain(TOP10_SLUG);

  await first.locator('[data-cover]').hover();
  await expect(page.locator('[data-testid$=":preview"] img')).toHaveAttribute(
    'src',
    'https://image.tmdb.org/t/p/w780/top.jpg',
  );
  await expect(first.locator('.af-poster-art img')).toHaveAttribute(
    'src',
    /^https:\/\/cdn\.animevietsub\.best\/data\/poster\//,
  );
});

test.describe('a failing art API', () => {
  test.use({ allowedConsoleErrors: [/status of 500/] });

  test('keeps the source images on the home page', async ({ page }) => {
    await page.route(LOOKUP, (route) =>
      route.fulfill({ status: 500, body: 'nope' }),
    );
    await page.goto('/?transport=replay');
    await expect(
      page.getByTestId('hero:slide:0').locator('img'),
    ).toHaveAttribute('src', /^https:\/\/cdn\.animevietsub\.best\//);
  });
});

test('MAL start dates make the upcoming tags precise and reorder the shelf', async ({
  page,
}) => {
  const mal = {
    id: 1,
    score: null,
    voters: null,
    rank: null,
    popularity: null,
    members: null,
    airing: 'not_yet_aired',
    episodes: null,
    startDate: null,
    startSeason: null,
  } as const;
  await stubArt(page, () => ({}), {
    'akatsuki-no-ryuu-a7009': {
      mal: { ...mal, startSeason: { year: 2027, season: 'winter' } },
    },
    'minato-machi-diary-a7010': { mal: { ...mal, startDate: '2027-01' } },
  });
  await page.clock.setFixedTime(UPCOMING_NOW);

  await page.goto('/?transport=replay');
  const shelf = page.getByTestId('shelf:upcoming');
  const tags = shelf.getByTestId('card:countdown');
  await expect(tags).toHaveText([
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
  ]);
  await expect(
    shelf
      .getByTestId('card:/phim/minato-machi-diary-a7010/')
      .locator('[data-cover]'),
  ).toHaveAttribute('aria-label', 'Minato Machi Diary, PV/??, 1/2027');
});

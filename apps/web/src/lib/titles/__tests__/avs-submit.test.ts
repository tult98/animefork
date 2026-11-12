// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { avsSubmissions, submitAvs } from '../avs-submit.ts';
import { parseCard } from '../card-parser.ts';
import { parseHome, parseNewEpisodes, parseSeason } from '../home.ts';
import { titleWatchLink } from '../link.ts';
import { buildHome } from '../shelves.ts';

const fixture = (name: string) =>
  readFileSync(
    resolve(import.meta.dirname, '../../../../public/fixtures/default', name),
    'utf8',
  );
const newEpisodes = parseNewEpisodes(
  fixture('danh-sach/all/all/all/all/all/all/jp.html'),
);

describe('voter count on a card', () => {
  const card = (attrs: string) =>
    new DOMParser().parseFromString(
      `<article class="TPostMv"><a href="/phim/a-1/"><h2 class="Title">A</h2></a><div class="anime-avg-user-rating"${attrs}>8.4</div></article>`,
      'text/html',
    ).body.firstElementChild!;

  it('is read from the score badge title', () => {
    expect(
      parseCard(
        card(' title="8.4 trong số 10 dựa trên 1,284 thành viên đánh giá"'),
      ).avsVoters,
    ).toBe(1284);
  });

  it.each([
    ['no title', ''],
    ['an unrelated title', ' title="hello"'],
  ])('is undefined with %s', (_name, attrs) => {
    expect(parseCard(card(attrs)).avsVoters).toBeUndefined();
  });

  it('is read on the saved site pages: every season card, not the hero cards', () => {
    const home = parseHome(fixture('index.html'));
    expect(home.hero.every((t) => t.avsVoters === undefined)).toBe(true);
    expect(newEpisodes.some((t) => t.avsVoters !== undefined)).toBe(true);
    const season = parseSeason(fixture('season/autumn/2026.html'));
    expect(season.length).toBeGreaterThan(0);
    expect(season.every((t) => (t.avsVoters ?? 0) > 0)).toBe(true);
  });
});

describe('avsSubmissions', () => {
  const home = parseHome(fixture('index.html'));
  const shelves = buildHome({ ...home, newEpisodes, season: undefined });
  const slugOf = (t: Parameters<typeof titleWatchLink>[0]) =>
    titleWatchLink(t).params.slug;

  it('sends only stale titles whose card has a voter count', () => {
    const withCount = newEpisodes.find((t) => t.avsVoters !== undefined)!;
    const heroOnly = home.hero.find(
      (h) => !newEpisodes.some((t) => slugOf(t) === slugOf(h)),
    )!;
    const items = avsSubmissions(shelves, [
      slugOf(withCount),
      slugOf(heroOnly),
      'not-on-screen',
    ]);
    expect(items).toEqual([
      expect.objectContaining({
        slug: slugOf(withCount),
        score: withCount.rating,
        voters: withCount.avsVoters,
      }),
    ]);
  });

  it('sends nothing when nothing is stale', () => {
    expect(avsSubmissions(shelves, [])).toEqual([]);
  });

  it('sends a title once even when several shelves show it', () => {
    const all = shelves.flatMap((s) => s.items.map(slugOf));
    const items = avsSubmissions(shelves, all);
    expect(new Set(items.map((i) => i.slug)).size).toBe(items.length);
  });
});

describe('submitAvs', () => {
  const item = (n: number) => ({ slug: `s-${n}`, score: 8, voters: n });

  it('posts to the ratings endpoint in batches of at most 50', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;
    await submitAvs(
      'https://api.test/',
      Array.from({ length: 120 }, (_, i) => item(i)),
      fetchImpl,
    );
    const calls = vi.mocked(fetchImpl).mock.calls;
    expect(calls.map((c) => c[0])).toEqual(
      Array(3).fill('https://api.test/v1/ratings/avs'),
    );
    expect(
      calls.map((c) => JSON.parse(String(c[1]?.body)).items.length),
    ).toEqual([50, 50, 20]);
  });

  it('throws when the API answers an error', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('no', { status: 500 }),
    ) as unknown as typeof fetch;
    await expect(
      submitAvs('https://api.test', [item(1)], fetchImpl),
    ).rejects.toThrow('500');
  });
});

import { z } from 'zod';
import { expectOk, type Transport } from '../transport/index.ts';

export const EpisodeSchema = z.object({
  id: z.string().regex(/^\d+$/),
  hash: z.string().min(1),
  play: z.string().min(1),
  label: z.string().min(1),
  name: z.string().min(1).optional(),
  thumbnail: z.string().min(1).optional(),
  synopsis: z.string().min(1).optional(),
});

export type Episode = z.infer<typeof EpisodeSchema>;

export const SeasonSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
});

export type Season = z.infer<typeof SeasonSchema>;

// The page lists the episodes of one season only, so the other seasons are links until they are opened.
export const WatchPageSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  image: z.string().min(1).optional(),
  seasons: z.array(SeasonSchema),
  currentSeason: SeasonSchema,
  episodes: z.array(EpisodeSchema).min(1),
  currentEpisode: EpisodeSchema,
});

export type WatchPage = z.infer<typeof WatchPageSchema>;

export class EpisodeNotFoundError extends Error {
  readonly code = 'EPISODE_NOT_FOUND';

  constructor(episodeId: string) {
    super(`Episode ${episodeId} is not on this title.`);
    this.name = 'EpisodeNotFoundError';
  }
}

const EPISODE_LINKS = '#list-server .list-episode .episode a[data-id]';
const SEASON_PREFIX = '/phim/';

function parseEpisodes(doc: Document): Episode[] {
  const seen = new Set<string>();
  const episodes: Episode[] = [];
  for (const a of doc.querySelectorAll(EPISODE_LINKS)) {
    const id = a.getAttribute('data-id') ?? '';
    if (seen.has(id)) continue;
    seen.add(id);
    const text = (a.textContent ?? '').replace(/^Xem\s+/i, '').trim();
    const label = /^\d/.test(text)
      ? `Tập ${text.replace(/^0+(?=\d)/, '')}`
      : text;
    const title = a.getAttribute('title')?.trim();
    episodes.push(
      EpisodeSchema.parse({
        id,
        hash: a.getAttribute('data-hash'),
        play: a.getAttribute('data-play'),
        label,
        // The site's own title repeats the label for a plain episode, so only a distinct one is a name.
        name: title && title !== `Tập ${text}` ? title : undefined,
      }),
    );
  }
  return episodes;
}

function slugOf(href: string | null): string | undefined {
  if (!href) return undefined;
  const { pathname } = new URL(href, 'https://watch.invalid');
  if (!pathname.startsWith(SEASON_PREFIX)) return undefined;
  return pathname.slice(SEASON_PREFIX.length).split('/')[0] || undefined;
}

function parseSeasons(doc: Document): Season[] {
  const seasons: Season[] = [];
  for (const a of doc.querySelectorAll('.season_item > a')) {
    const slug = slugOf(a.getAttribute('href'));
    if (slug) {
      seasons.push(SeasonSchema.parse({ slug, name: a.textContent?.trim() }));
    }
  }
  return seasons;
}

export function parseWatchPage(html: string, slug: string): WatchPage {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const title = doc.querySelector('h1.Title')?.textContent?.trim();
  const image =
    doc.querySelector('.Image img')?.getAttribute('src') || undefined;
  const episodes = parseEpisodes(doc);
  const seasons = parseSeasons(doc);
  const currentSeason = seasons.find((s) => s.slug === slug) ?? {
    slug,
    name: title ?? slug,
  };
  return WatchPageSchema.parse({
    slug,
    title,
    image,
    seasons: seasons.length > 0 ? seasons : [currentSeason],
    currentSeason,
    episodes,
    currentEpisode: episodes[0],
  });
}

export function selectEpisode(page: WatchPage, episodeId: string): WatchPage {
  const currentEpisode = page.episodes.find((e) => e.id === episodeId);
  if (!currentEpisode) throw new EpisodeNotFoundError(episodeId);
  return { ...page, currentEpisode };
}

export async function fetchWatchPage(
  transport: Transport,
  slug: string,
  signal?: AbortSignal,
): Promise<WatchPage> {
  const url = `${SEASON_PREFIX}${slug}/xem-phim.html`;
  const res = await transport.get({ url, signal });
  expectOk(res, url);
  return parseWatchPage(res.data, slug);
}

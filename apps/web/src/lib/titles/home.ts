import type { Transport } from '../transport/index.ts';
import { expectOk } from '../transport/index.ts';
import { TitleListSchema, type Title } from './title.ts';

// Stand-in for the real home parser. It reads the synthetic fixture's markup and hands raw
// strings to zod, so a malformed page fails validation instead of rendering garbage.
export function extractRawTitles(html: string): Record<string, unknown>[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return [...doc.querySelectorAll<HTMLElement>('[data-title]')].map((el) => ({
    path: el.dataset.path,
    name: el.dataset.title,
    rating:
      el.dataset.rating === undefined ? undefined : Number(el.dataset.rating),
    episodeLabel: el.dataset.episode,
    image: el.querySelector('img')?.getAttribute('src') ?? undefined,
  }));
}

export async function fetchHomeTitles(
  transport: Transport,
  signal?: AbortSignal,
): Promise<Title[]> {
  const res = await transport.get({ url: '/', signal });
  expectOk(res, '/');
  return TitleListSchema.parse(extractRawTitles(res.data));
}

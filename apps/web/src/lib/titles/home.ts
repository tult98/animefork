import { parseHome, type Home, type Title } from 'catalog';
import type { Transport } from '../transport/index.ts';
import { expectOk } from '../transport/index.ts';
import { TitleListSchema } from './title.ts';

// The shelves engine replaces this flat list. Until then the first card per title wins, and the
// carousel goes last because its cards carry a banner image instead of a poster.
const SECTION_ORDER = [
  'thisSeason',
  'lastUpdate',
  'nominate',
  'preRelease',
  'hotUpdate',
  'carousel',
] as const satisfies readonly (keyof Home)[];

export function flattenHome(home: Home): Title[] {
  const seen = new Set<string>();
  return SECTION_ORDER.flatMap((section) => home[section]).filter((title) => {
    if (seen.has(title.id)) return false;
    seen.add(title.id);
    return true;
  });
}

export async function fetchHomeTitles(
  transport: Transport,
  signal?: AbortSignal,
): Promise<Title[]> {
  const res = await transport.get({ url: '/', signal });
  expectOk(res, '/');
  return TitleListSchema.parse(flattenHome(parseHome(res.data)));
}

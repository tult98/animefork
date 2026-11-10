import type { ArtEntry, LookupRequest, LookupResponse } from './contract.ts';
import { isSettled } from './retry.ts';
import type { ArtStore } from './art.store.ts';
import type { ArtFiller } from './art.filler.ts';

export interface LookupDeps {
  store: ArtStore;
  filler: Pick<ArtFiller, 'has' | 'fill'>;
  now: Date;
}

export async function lookup(
  request: LookupRequest,
  { store, filler, now }: LookupDeps,
): Promise<LookupResponse> {
  const titles = new Map(request.titles.map((t) => [t.slug, t]));
  const rows = await store.find([...titles.keys()]);
  const art: Record<string, ArtEntry> = {};
  const ready: string[] = [];

  for (const [slug, title] of titles) {
    const row = rows.get(slug);
    if (row && isSettled(row, now)) {
      if (row.status === 'matched') {
        art[slug] = {
          status: 'ready',
          backdropPath: row.backdropPath,
          backdropLang: row.backdropLang,
        };
        ready.push(slug);
      } else {
        art[slug] = { status: 'none' };
      }
      continue;
    }
    if (!filler.has(slug)) void filler.fill(title);
    art[slug] = { status: 'pending' };
  }

  if (request.episodes) {
    await Promise.all(
      ready.map(async (slug) => {
        const stills = await store.episodes(slug);
        const entry = art[slug];
        if (entry?.status === 'ready') {
          entry.stills = Object.fromEntries(
            [...stills].map(([n, path]) => [String(n), path]),
          );
        }
      }),
    );
  }
  return { art };
}

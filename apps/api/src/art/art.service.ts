import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.ts';
import type { ArtEntry, LookupRequest, LookupResponse } from './contract.ts';
import { isSettled, isStale } from './retry.ts';
import { ART_STORE, type ArtStore } from './art.store.ts';
import { ArtFiller } from './art.filler.ts';

@Injectable()
export class ArtService {
  private readonly store: ArtStore;
  private readonly filler: ArtFiller;
  private readonly clock: Clock;

  constructor(
    @Inject(ART_STORE) store: ArtStore,
    @Inject(ArtFiller) filler: ArtFiller,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.store = store;
    this.filler = filler;
    this.clock = clock;
  }

  async lookup(request: LookupRequest): Promise<LookupResponse> {
    const { store, filler } = this;
    const now = this.clock();
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
            posterPath: row.posterPath,
          };
          if (isStale(row) && !filler.has(slug)) void filler.fill(title);
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
}

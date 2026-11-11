import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.ts';
import { isAvsStale } from '../ratings/ratings.ts';
import {
  MemoryRatingsStore,
  RATINGS_STORE,
  type RatingsStore,
} from '../ratings/ratings.store.ts';
import type {
  ArtEntry,
  LookupRequest,
  LookupResponse,
  TitleRatings,
} from './contract.ts';
import { isOverviewSettled, isSettled, isStale } from './retry.ts';
import { ART_STORE, type ArtStore } from './art.store.ts';
import { ArtFiller } from './art.filler.ts';

@Injectable()
export class ArtService {
  private readonly store: ArtStore;
  private readonly filler: ArtFiller;
  private readonly clock: Clock;
  private readonly ratings: RatingsStore;

  constructor(
    @Inject(ART_STORE) store: ArtStore,
    @Inject(ArtFiller) filler: ArtFiller,
    @Inject(CLOCK) clock: Clock,
    @Inject(RATINGS_STORE) ratings: RatingsStore = new MemoryRatingsStore(),
  ) {
    this.store = store;
    this.filler = filler;
    this.clock = clock;
    this.ratings = ratings;
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
          const overviewOk = row.overviewStatus === 'ok';
          art[slug] = {
            status: 'ready',
            backdropPath: row.backdropPath,
            backdropLang: row.backdropLang,
            posterPath: row.posterPath,
            overview: overviewOk ? row.overview : null,
            overviewTranslated: overviewOk && row.overviewTranslated,
          };
          if (isStale(row) && !filler.has(slug)) void filler.fill(title);
          if (
            row.tmdbId !== null &&
            !isOverviewSettled(row, now) &&
            !filler.has(slug) &&
            !filler.hasOverview(slug)
          ) {
            void filler.fillOverview(slug, row.tmdbId);
          }
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
    const stored = await this.ratings.find([...titles.keys()]);
    const ratings: Record<string, TitleRatings> = {};
    const avsStale: string[] = [];
    for (const slug of titles.keys()) {
      const row = stored.get(slug);
      if (isAvsStale(row, now)) avsStale.push(slug);
      const entry: TitleRatings = {};
      if (row?.avsScore != null && row.avsVoters != null) {
        entry.avs = { score: row.avsScore, voters: row.avsVoters };
      }
      if (row?.quality) entry.quality = row.quality;
      if (entry.avs || entry.quality) ratings[slug] = entry;
    }
    return { art, ratings, avsStale };
  }
}

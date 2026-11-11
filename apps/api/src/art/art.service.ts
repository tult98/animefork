import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.ts';
import type { MalFiller } from '../mal/mal.filler.ts';
import { MAL_FILLER } from '../mal/mal.module.ts';
import { isMalSettled } from '../mal/mal.retry.ts';
import { MAL_STORE, MemoryMalStore, type MalStore } from '../mal/mal.store.ts';
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
import { ART_SYNC, ArtFiller } from './art.filler.ts';
import { tmdbAliases } from './tmdb/aliases.ts';
import type { SyncDeps } from './tmdb/sync.ts';

@Injectable()
export class ArtService {
  private readonly store: ArtStore;
  private readonly filler: ArtFiller;
  private readonly clock: Clock;
  private readonly ratings: RatingsStore;
  private readonly mal: MalStore;
  private readonly malFiller: MalFiller | null;
  private readonly tmdb: SyncDeps['tmdb'] | null;

  constructor(
    @Inject(ART_STORE) store: ArtStore,
    @Inject(ArtFiller) filler: ArtFiller,
    @Inject(CLOCK) clock: Clock,
    @Inject(RATINGS_STORE) ratings: RatingsStore = new MemoryRatingsStore(),
    @Inject(MAL_STORE) mal: MalStore = new MemoryMalStore(),
    @Inject(MAL_FILLER) malFiller: MalFiller | null = null,
    @Inject(ART_SYNC) sync: SyncDeps | null = null,
  ) {
    this.store = store;
    this.filler = filler;
    this.clock = clock;
    this.ratings = ratings;
    this.mal = mal;
    this.malFiller = malFiller;
    this.tmdb = sync?.tmdb ?? null;
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
    const malRows = await this.mal.find([...titles.keys()]);
    const ratings: Record<string, TitleRatings> = {};
    const avsStale: string[] = [];
    let ratingsPending = false;
    for (const [slug, title] of titles) {
      const row = stored.get(slug);
      if (isAvsStale(row, now)) avsStale.push(slug);
      const entry: TitleRatings = {};
      if (row?.avsScore != null && row.avsVoters != null) {
        entry.avs = { score: row.avsScore, voters: row.avsVoters };
      }
      if (row?.quality) entry.quality = row.quality;
      const mal = malRows.get(slug);
      if (mal?.status === 'ok' && mal.malId !== null) {
        entry.mal = {
          id: mal.malId,
          score: mal.score,
          voters: mal.voters,
          rank: mal.rank,
          popularity: mal.popularity,
          members: mal.members,
          airing: mal.airing,
          episodes: mal.episodes,
        };
      }
      if (this.malFiller && !isMalSettled(mal, now)) {
        if (!this.malFiller.has(slug)) {
          void this.malFiller.fill(title, this.aliasSource(rows.get(slug)));
        }
        // A stored number is already shown, so only a title with none yet is worth asking about again.
        if (mal?.status !== 'ok') ratingsPending = true;
      }
      if (entry.avs || entry.quality || entry.mal) ratings[slug] = entry;
    }
    return {
      art,
      ratings,
      avsStale,
      ...(ratingsPending && { ratingsPending }),
    };
  }

  // The TMDB match, when there is one, knows the show by an English name MAL also lists.
  private aliasSource(row: { tmdbId: number | null } | undefined) {
    const { tmdb } = this;
    const id = row?.tmdbId ?? null;
    return tmdb && id !== null ? () => tmdbAliases(tmdb, id) : undefined;
  }
}

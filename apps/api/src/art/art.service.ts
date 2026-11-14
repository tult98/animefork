import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.ts';
import type { MalFiller } from '../mal/mal.filler.ts';
import { MAL_FILLER } from '../mal/mal.module.ts';
import { isMalSettled } from '../mal/mal.retry.ts';
import { MAL_STORE, type MalStore, type StoredMal } from '../mal/mal.store.ts';
import { isAvsStale } from '../ratings/ratings.ts';
import { RATINGS_STORE, type RatingsStore } from '../ratings/ratings.store.ts';
import type {
  ArtEntry,
  EpisodesQuery,
  LookupRequest,
  LookupResponse,
  TitleInput,
  StillsResponse,
  TitleRatings,
} from './contract.ts';
import { artStatus, isOverviewSettled, isStale } from './retry.ts';
import { ART_STORE, type ArtStore, type StoredTitle } from './art.store.ts';
import { ART_SYNC, ArtFiller } from './art.filler.ts';
import {
  TITLE_NAMES_STORE,
  type StoredNames,
  type TitleNamesStore,
} from './title-names.store.ts';
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
  private readonly names: TitleNamesStore;

  constructor(
    @Inject(ART_STORE) store: ArtStore,
    @Inject(ArtFiller) filler: ArtFiller,
    @Inject(CLOCK) clock: Clock,
    @Inject(RATINGS_STORE) ratings: RatingsStore,
    @Inject(MAL_STORE) mal: MalStore,
    @Inject(MAL_FILLER) malFiller: MalFiller | null = null,
    @Inject(ART_SYNC) sync: SyncDeps | null = null,
    @Inject(TITLE_NAMES_STORE) names: TitleNamesStore,
  ) {
    this.store = store;
    this.filler = filler;
    this.clock = clock;
    this.ratings = ratings;
    this.mal = mal;
    this.malFiller = malFiller;
    this.tmdb = sync?.tmdb ?? null;
    this.names = names;
  }

  async lookup(request: LookupRequest): Promise<LookupResponse> {
    const { store, filler } = this;
    const now = this.clock();
    const requested = new Map(request.titles.map((t) => [t.slug, t]));
    const slugs = [...requested.keys()];
    const [rows, malRows] = await Promise.all([
      store.find(slugs),
      this.mal.find(slugs),
    ]);
    const names = await this.storeNames(requested, rows, malRows, now);
    const titles = new Map(
      [...requested].map(([slug, t]) => [slug, withNames(t, names.get(slug))]),
    );
    const art: Record<string, ArtEntry> = {};

    for (const [slug, title] of titles) {
      const row = rows.get(slug);
      const namesAt = names.get(slug)?.updatedAt;
      const status = artStatus(row, now, namesAt);
      if (row && status !== 'pending') {
        if (status === 'ready') {
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
            row.tmdbKind !== null &&
            row.tmdbId !== null &&
            !isOverviewSettled(row, now) &&
            !filler.has(slug) &&
            !filler.hasOverview(slug)
          ) {
            void filler.fillOverview(slug, row.tmdbKind, row.tmdbId);
          }
        } else {
          art[slug] = { status: 'none' };
        }
        continue;
      }
      if (!filler.has(slug)) void filler.fill(title, namesAt);
      art[slug] = { status: 'pending' };
    }

    const stored = await this.ratings.find(slugs);
    const ratings: Record<string, TitleRatings> = {};
    const avsStale: string[] = [];
    let ratingsPending = false;
    const matched: StoredMal[] = [];
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
        matched.push(mal);
        entry.mal = {
          id: mal.malId,
          score: mal.score,
          voters: mal.voters,
          rank: mal.rank,
          popularity: mal.popularity,
          members: mal.members,
          airing: mal.airing,
          episodes: mal.episodes,
          startDate: mal.startDate,
          startSeason: mal.startSeason,
          trailerYoutubeId: mal.trailerYoutubeId,
        };
      }
      const namesAt = names.get(slug)?.updatedAt;
      if (this.malFiller && !isMalSettled(mal, now, namesAt)) {
        if (!this.malFiller.has(slug)) {
          void this.malFiller.fill(
            title,
            this.aliasSource(rows.get(slug)),
            namesAt,
            this.takenSource(slug, title.name),
          );
        }
        // A stored number is already shown, so only a title with none yet is worth asking about again.
        if (mal?.status !== 'ok') ratingsPending = true;
      }
      if (entry.avs || entry.quality || entry.mal) ratings[slug] = entry;
    }
    // Titles matched before episode names were stored get them from their next lookup.
    void this.malFiller?.ensureEpisodes(matched);
    return {
      art,
      ratings,
      avsStale,
      ...(ratingsPending && { ratingsPending }),
    };
  }

  // Reads only what the lookup's fill stored. A title the lookup has not matched yet answers `pending`.
  async stills(
    slug: string,
    { from, limit }: EpisodesQuery,
  ): Promise<StillsResponse> {
    const [row, names] = await Promise.all([
      this.store.find([slug]).then((rows) => rows.get(slug)),
      this.names.find([slug]).then((found) => found.get(slug)),
    ]);
    const status = artStatus(row, this.clock(), names?.updatedAt);
    if (status !== 'ready') return { status, stills: {} };
    const page = await this.store.episodesPage(slug, from, limit);
    return {
      status,
      stills: Object.fromEntries(
        [...page].map(([n, path]) => [String(n), path]),
      ),
    };
  }

  private async storeNames(
    titles: Map<string, TitleInput>,
    rows: Map<string, Pick<StoredTitle, 'status'>>,
    malRows: Map<string, Pick<StoredMal, 'status'>>,
    now: Date,
  ): Promise<Map<string, StoredNames>> {
    const slugs = [...titles.keys()];
    const stored = await this.names.find(slugs);
    const fresh = [...titles.values()].flatMap(({ slug, otherNames }) =>
      otherNames?.length &&
      !stored.has(slug) &&
      (malRows.get(slug)?.status !== 'ok' ||
        rows.get(slug)?.status !== 'matched')
        ? [{ slug, otherNames }]
        : [],
    );
    if (fresh.length === 0) return stored;
    await Promise.all(
      fresh.map((t) => this.names.saveIfAbsent(t.slug, t.otherNames, now)),
    );
    return this.names.find(slugs);
  }

  // The TMDB match, when there is one, knows the show by an English name MAL also lists.
  private aliasSource(
    row: Pick<StoredTitle, 'tmdbKind' | 'tmdbId'> | undefined,
  ) {
    const { tmdb } = this;
    const kind = row?.tmdbKind ?? null;
    const id = row?.tmdbId ?? null;
    return tmdb && kind !== null && id !== null
      ? () => tmdbAliases(tmdb, kind, id)
      : undefined;
  }

  private takenSource(slug: string, name: string) {
    return async () => {
      const others = await this.store.slugsNamed(name, slug);
      const held = await this.mal.find(others);
      return [...held.values()].flatMap((m) =>
        m.status === 'ok' && m.malId !== null ? [m.malId] : [],
      );
    };
  }
}

function withNames(
  title: TitleInput,
  stored: StoredNames | undefined,
): TitleInput {
  if (stored) return { ...title, otherNames: stored.names };
  const bare = { ...title };
  delete bare.otherNames;
  return bare;
}

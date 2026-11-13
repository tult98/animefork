import { Inject, Injectable } from '@nestjs/common';
import { ART_STORE, type ArtStore } from '../art/art.store.ts';
import type { EpisodeInfo, EpisodesResponse } from '../art/contract.ts';
import { CLOCK, type Clock } from '../common/clock.ts';
import { looksVietnamese } from '../common/vietnamese.ts';
import type { MalFiller } from '../mal/mal.filler.ts';
import { MAL_FILLER } from '../mal/mal.module.ts';
import { isMalSettled } from '../mal/mal.retry.ts';
import { MAL_STORE, type MalStore } from '../mal/mal.store.ts';
import { isEpisodeListSettled } from './episode.retry.ts';
import {
  EPISODE_STORE,
  type EpisodeStore,
  type StoredEpisode,
} from './episode.store.ts';
import type { StoredTmdbEpisode } from '../art/art.store.ts';

// Reads only what the fillers already stored. A missing list is scheduled and answered `pending`, never fetched here.
@Injectable()
export class EpisodeInfoService {
  private readonly mal: MalStore;
  private readonly malFiller: MalFiller | null;
  private readonly episodes: EpisodeStore;
  private readonly art: ArtStore;
  private readonly clock: Clock;

  constructor(
    @Inject(MAL_STORE) mal: MalStore,
    @Inject(MAL_FILLER) malFiller: MalFiller | null,
    @Inject(EPISODE_STORE) episodes: EpisodeStore,
    @Inject(ART_STORE) art: ArtStore,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.mal = mal;
    this.malFiller = malFiller;
    this.episodes = episodes;
    this.art = art;
    this.clock = clock;
  }

  async get(slug: string): Promise<EpisodesResponse> {
    const now = this.clock();
    const row = (await this.mal.find([slug])).get(slug);
    const malId = row?.status === 'ok' ? row.malId : null;
    if (row && malId !== null) void this.malFiller?.ensureEpisodes([row]);

    const [listed, attempts, tmdb] = await Promise.all([
      malId === null
        ? new Map<number, StoredEpisode>()
        : this.episodes.find(malId),
      malId === null ? new Map() : this.episodes.listAttempts([malId]),
      this.art.tmdbEpisodes(slug),
    ]);
    const episodes = merge(listed, tmdb);
    if (episodes.length > 0) return { status: 'ready', episodes };

    const settled =
      row && malId !== null
        ? isEpisodeListSettled(attempts.get(malId), row.airing, now)
        : isMalSettled(row, now);
    return { status: settled ? 'none' : 'pending', episodes: [] };
  }
}

// MAL's title wins over TMDB's name. The Vietnamese fields fall back to TMDB's only when MAL has none yet.
function merge(
  listed: Map<number, StoredEpisode>,
  tmdb: Map<number, StoredTmdbEpisode>,
): EpisodeInfo[] {
  const numbers = new Set([...listed.keys(), ...tmdb.keys()]);
  return [...numbers]
    .sort((a, b) => a - b)
    .map((number) => {
      const mal = listed.get(number);
      const t = tmdb.get(number);
      const nameIsVi = t?.name != null && looksVietnamese(t.name);
      return {
        number,
        title: mal?.title ?? (nameIsVi ? null : (t?.name ?? null)),
        titleVi: mal?.titleVi ?? (nameIsVi ? (t?.name ?? null) : null),
        synopsis:
          mal?.synopsis ?? (t?.overviewLang === 'en' ? t.overview : null),
        synopsisVi: mal?.synopsisVi ?? t?.overviewVi ?? null,
        aired: mal?.aired ?? null,
      };
    });
}

import { Inject, Injectable } from '@nestjs/common';
import type {
  EpisodeInfo,
  EpisodesQuery,
  EpisodesResponse,
} from '../art/contract.ts';
import { CLOCK, type Clock } from '../common/clock.ts';
import type { MalFiller } from '../mal/mal.filler.ts';
import { MAL_FILLER } from '../mal/mal.module.ts';
import { isMalSettled } from '../mal/mal.retry.ts';
import { MAL_STORE, type MalStore } from '../mal/mal.store.ts';
import { isEpisodeListSettled } from './episode.retry.ts';
import { EPISODE_STORE, type EpisodeStore } from './episode.store.ts';

// Reads only what the fillers already stored. A missing list is scheduled and answered `pending`, never fetched here.
@Injectable()
export class EpisodeInfoService {
  private readonly mal: MalStore;
  private readonly malFiller: MalFiller | null;
  private readonly episodes: EpisodeStore;
  private readonly clock: Clock;

  constructor(
    @Inject(MAL_STORE) mal: MalStore,
    @Inject(MAL_FILLER) malFiller: MalFiller | null,
    @Inject(EPISODE_STORE) episodes: EpisodeStore,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.mal = mal;
    this.malFiller = malFiller;
    this.episodes = episodes;
    this.clock = clock;
  }

  async get(
    slug: string,
    { from, limit }: EpisodesQuery,
  ): Promise<EpisodesResponse> {
    const now = this.clock();
    const row = (await this.mal.find([slug])).get(slug);
    const malId = row?.status === 'ok' ? row.malId : null;
    if (row && malId !== null) void this.malFiller?.ensureEpisodes([row]);

    const [page, attempts] =
      malId === null
        ? [[], new Map()]
        : await Promise.all([
            this.episodes.findPage(malId, from, limit),
            this.episodes.listAttempts([malId]),
          ]);
    const episodes: EpisodeInfo[] = page.map(
      ({ number, title, titleVi, aired, synopsis, synopsisVi }) => ({
        number,
        title,
        titleVi,
        aired,
        synopsis,
        synopsisVi,
      }),
    );
    if (episodes.length > 0) return { status: 'ready', episodes };
    if (malId !== null && from > 1 && (await this.episodes.hasEpisodes(malId)))
      return { status: 'ready', episodes: [] };

    const settled =
      row && malId !== null
        ? isEpisodeListSettled(attempts.get(malId), row.airing, now)
        : isMalSettled(row, now);
    return { status: settled ? 'none' : 'pending', episodes: [] };
  }
}

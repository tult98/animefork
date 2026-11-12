import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/contract.ts';
import { CurrentUser } from '../auth/current-user.decorator.ts';
import { SessionGuard } from '../auth/session.guard.ts';
import { CLOCK, type Clock } from '../common/clock.ts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import {
  SaveWatchProgressRequestSchema,
  WATCH_PROGRESS_PATH,
  WATCH_PROGRESS_SHELF_LIMIT,
  WATCH_PROGRESS_SLUG_PATH,
  type SaveWatchProgressRequest,
  type WatchProgressEpisodesResponse,
  type WatchProgressShelfResponse,
} from './contract.ts';
import { clampPosition, isCompleted } from './watch-progress.ts';
import {
  WATCH_PROGRESS_STORE,
  type WatchProgressStore,
} from './watch-progress.store.ts';

@Controller()
@UseGuards(SessionGuard)
export class WatchProgressController {
  private readonly store: WatchProgressStore;
  private readonly now: Clock;

  constructor(
    @Inject(WATCH_PROGRESS_STORE) store: WatchProgressStore,
    @Inject(CLOCK) now: Clock,
  ) {
    this.store = store;
    this.now = now;
  }

  @Put(WATCH_PROGRESS_PATH)
  @HttpCode(204)
  async save(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(SaveWatchProgressRequestSchema))
    body: SaveWatchProgressRequest,
  ): Promise<void> {
    const positionS = clampPosition(body.positionS, body.durationS);
    await this.store.save({
      userId: user.id,
      slug: body.slug,
      episodeId: body.episodeId,
      positionS,
      durationS: body.durationS,
      completed: isCompleted(positionS, body.durationS),
      titleName: body.titleName,
      image: body.image,
      episodeLabel: body.episodeLabel,
      seasonSlug: body.seasonSlug ?? null,
      updatedAt: this.now(),
    });
  }

  @Get(WATCH_PROGRESS_PATH)
  async shelf(
    @CurrentUser() user: AuthUser,
  ): Promise<WatchProgressShelfResponse> {
    const rows = await this.store.latestPerSlug(
      user.id,
      WATCH_PROGRESS_SHELF_LIMIT,
    );
    return {
      items: rows.map((row) => ({
        slug: row.slug,
        episodeId: row.episodeId,
        episodeLabel: row.episodeLabel,
        titleName: row.titleName,
        image: row.image,
        seasonSlug: row.seasonSlug,
        positionS: row.positionS,
        durationS: row.durationS,
        completed: row.completed,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  @Get(WATCH_PROGRESS_SLUG_PATH)
  async episodes(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
  ): Promise<WatchProgressEpisodesResponse> {
    const rows = await this.store.forSlug(user.id, slug);
    return {
      items: rows.map((row) => ({
        episodeId: row.episodeId,
        positionS: row.positionS,
        durationS: row.durationS,
        completed: row.completed,
      })),
    };
  }
}

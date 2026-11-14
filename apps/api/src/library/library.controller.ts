import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '../auth/contract.ts';
import { CurrentUser } from '../auth/current-user.decorator.ts';
import { SessionGuard } from '../auth/session.guard.ts';
import { CLOCK, type Clock } from '../common/clock.ts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import {
  AddPlaylistItemRequestSchema,
  CreatePlaylistRequestSchema,
  LIBRARY_LIST_LIMIT,
  LIBRARY_PATH,
  LIBRARY_PLAYLISTS_PATH,
  LIBRARY_PLAYLIST_ITEM_PATH,
  LIBRARY_RATING_PATH,
  SetRatingRequestSchema,
  SlugParamSchema,
  type AddPlaylistItemRequest,
  type CreatePlaylistRequest,
  type LibraryPlaylistItem,
  type LibraryRating,
  type LibraryResponse,
  type PlaylistSummary,
  type SetRatingRequest,
} from './contract.ts';
import type { PlaylistItemRow, RatingRow } from './library.ts';
import { LIBRARY_STORE, type LibraryStore } from './library.store.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toLibraryRating(row: RatingRow): LibraryRating {
  return {
    slug: row.slug,
    rating: row.rating,
    titleName: row.titleName,
    image: row.image,
    genres: row.genres,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toLibraryItem(row: PlaylistItemRow): LibraryPlaylistItem {
  return {
    slug: row.slug,
    titleName: row.titleName,
    image: row.image,
    genres: row.genres,
    addedAt: row.addedAt.toISOString(),
  };
}

function requirePlaylistFound(found: boolean): void {
  if (!found) throw new NotFoundException();
}

@Controller()
@UseGuards(SessionGuard)
export class LibraryController {
  private readonly store: LibraryStore;
  private readonly now: Clock;

  constructor(
    @Inject(LIBRARY_STORE) store: LibraryStore,
    @Inject(CLOCK) now: Clock,
  ) {
    this.store = store;
    this.now = now;
  }

  @Get(LIBRARY_PATH)
  async library(@CurrentUser() user: AuthUser): Promise<LibraryResponse> {
    const [ratings, playlists, items] = await Promise.all([
      this.store.ratings(user.id, LIBRARY_LIST_LIMIT),
      this.store.playlists(user.id),
      this.store.playlistItems(user.id, LIBRARY_LIST_LIMIT),
    ]);
    return {
      ratings: ratings.map(toLibraryRating),
      playlists: playlists.map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        items: items
          .filter((item) => item.playlistId === playlist.id)
          .map(toLibraryItem),
      })),
    };
  }

  @Put(LIBRARY_RATING_PATH)
  async setRating(
    @CurrentUser() user: AuthUser,
    @Param('slug', new ZodValidationPipe(SlugParamSchema)) slug: string,
    @Body(new ZodValidationPipe(SetRatingRequestSchema))
    body: SetRatingRequest,
  ): Promise<LibraryRating> {
    const stored = await this.store.setRating({
      userId: user.id,
      slug,
      rating: body.rating,
      titleName: body.titleName,
      image: body.image,
      genres: body.genres,
      updatedAt: this.now(),
    });
    return toLibraryRating(stored);
  }

  @Delete(LIBRARY_RATING_PATH)
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearRating(
    @CurrentUser() user: AuthUser,
    @Param('slug', new ZodValidationPipe(SlugParamSchema)) slug: string,
  ): Promise<void> {
    await this.store.clearRating(user.id, slug);
  }

  @Post(LIBRARY_PLAYLISTS_PATH)
  async createPlaylist(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(CreatePlaylistRequestSchema))
    body: CreatePlaylistRequest,
  ): Promise<PlaylistSummary> {
    const created = await this.store.createPlaylist(
      user.id,
      body.name,
      this.now(),
    );
    if (!created) throw new ConflictException({ error: 'playlist_name_taken' });
    return { id: created.id, name: created.name };
  }

  @Put(LIBRARY_PLAYLIST_ITEM_PATH)
  @HttpCode(HttpStatus.NO_CONTENT)
  async addItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('slug', new ZodValidationPipe(SlugParamSchema)) slug: string,
    @Body(new ZodValidationPipe(AddPlaylistItemRequestSchema))
    body: AddPlaylistItemRequest,
  ): Promise<void> {
    const found =
      UUID.test(id) &&
      (await this.store.addItem(user.id, {
        playlistId: id,
        slug,
        titleName: body.titleName,
        image: body.image,
        genres: body.genres,
        addedAt: this.now(),
      }));
    requirePlaylistFound(found);
  }

  @Delete(LIBRARY_PLAYLIST_ITEM_PATH)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeItem(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('slug', new ZodValidationPipe(SlugParamSchema)) slug: string,
  ): Promise<void> {
    const found =
      UUID.test(id) && (await this.store.removeItem(user.id, id, slug));
    requirePlaylistFound(found);
  }
}

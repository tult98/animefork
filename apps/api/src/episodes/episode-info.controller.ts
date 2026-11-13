import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  EPISODES_PATH,
  EpisodesQuerySchema,
  EpisodesSlugSchema,
  type EpisodesQuery,
  type EpisodesResponse,
} from '../art/contract.ts';
import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import { EpisodeInfoService } from './episode-info.service.ts';

@Controller()
export class EpisodeInfoController {
  private readonly info: EpisodeInfoService;

  constructor(@Inject(EpisodeInfoService) info: EpisodeInfoService) {
    this.info = info;
  }

  @Get(`${EPISODES_PATH}/:slug`)
  get(
    @Param('slug', new ZodValidationPipe(EpisodesSlugSchema)) slug: string,
    @Query(new ZodValidationPipe(EpisodesQuerySchema)) query: EpisodesQuery,
  ): Promise<EpisodesResponse> {
    return this.info.get(slug, query);
  }
}

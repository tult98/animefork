import { Controller, Get, Inject, Param } from '@nestjs/common';
import {
  EPISODES_PATH,
  EpisodesSlugSchema,
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
  ): Promise<EpisodesResponse> {
    return this.info.get(slug);
  }
}

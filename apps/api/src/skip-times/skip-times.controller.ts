import { Controller, Get, Inject, Param } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import {
  SKIP_TIMES_PATH,
  SkipTimesEpisodeSchema,
  SkipTimesSlugSchema,
  type SkipTimesResponse,
} from './contract.ts';
import { SkipTimesService } from './skip-times.service.ts';

@Controller()
export class SkipTimesController {
  private readonly skipTimes: SkipTimesService;

  constructor(@Inject(SkipTimesService) skipTimes: SkipTimesService) {
    this.skipTimes = skipTimes;
  }

  @Get(SKIP_TIMES_PATH)
  lookup(
    @Param('slug', new ZodValidationPipe(SkipTimesSlugSchema)) slug: string,
    @Param('episode', new ZodValidationPipe(SkipTimesEpisodeSchema))
    episode: number,
  ): Promise<SkipTimesResponse> {
    return this.skipTimes.lookup(slug, episode);
  }
}

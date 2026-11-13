import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import { ArtService } from './art.service.ts';
import {
  EpisodesQuerySchema,
  EpisodesSlugSchema,
  LOOKUP_PATH,
  LookupRequestSchema,
  STILLS_PATH,
  type EpisodesQuery,
  type LookupRequest,
  type LookupResponse,
  type StillsResponse,
} from './contract.ts';

@Controller()
export class ArtController {
  private readonly art: ArtService;

  constructor(@Inject(ArtService) art: ArtService) {
    this.art = art;
  }

  @Post(LOOKUP_PATH)
  @HttpCode(200)
  lookup(
    @Body(new ZodValidationPipe(LookupRequestSchema)) request: LookupRequest,
  ): Promise<LookupResponse> {
    return this.art.lookup(request);
  }

  @Get(`${STILLS_PATH}/:slug`)
  stills(
    @Param('slug', new ZodValidationPipe(EpisodesSlugSchema)) slug: string,
    @Query(new ZodValidationPipe(EpisodesQuerySchema)) query: EpisodesQuery,
  ): Promise<StillsResponse> {
    return this.art.stills(slug, query);
  }
}

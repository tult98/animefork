import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import { ArtService } from './art.service.ts';
import {
  LOOKUP_PATH,
  LookupRequestSchema,
  type LookupRequest,
  type LookupResponse,
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
}

import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import {
  AVS_RATINGS_PATH,
  AvsSubmitRequestSchema,
  type AvsSubmitRequest,
} from '../art/contract.ts';
import { RATINGS_STORE, type RatingsStore } from './ratings.store.ts';

@Controller()
export class RatingsController {
  private readonly store: RatingsStore;

  constructor(@Inject(RATINGS_STORE) store: RatingsStore) {
    this.store = store;
  }

  @Post(AVS_RATINGS_PATH)
  @HttpCode(204)
  async submitAvs(
    @Body(new ZodValidationPipe(AvsSubmitRequestSchema))
    request: AvsSubmitRequest,
  ): Promise<void> {
    await this.store.saveAvs(request.items);
  }
}

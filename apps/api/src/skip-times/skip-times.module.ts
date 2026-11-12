import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.ts';
import { MalModule } from '../mal/mal.module.ts';
import { createAniskipClient } from './aniskip.client.ts';
import { SkipTimesController } from './skip-times.controller.ts';
import { ANISKIP_CLIENT, SkipTimesService } from './skip-times.service.ts';

@Module({
  imports: [MalModule],
  controllers: [SkipTimesController],
  providers: [
    { provide: ANISKIP_CLIENT, useFactory: () => createAniskipClient() },
    { provide: CLOCK, useValue: systemClock },
    SkipTimesService,
  ],
})
export class SkipTimesModule {}

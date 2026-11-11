import { Module } from '@nestjs/common';
import { CLOCK, systemClock, type Clock } from '../common/clock.ts';
import { ENV } from '../config/app.config.ts';
import { createMalClient, type MalClient } from './mal.client.ts';
import { MAL_CONFIG, loadMalConfig, type MalConfig } from './mal.config.ts';
import { MalFiller } from './mal.filler.ts';
import { MAL_STORE, PostgresMalStore, type MalStore } from './mal.store.ts';

export const MAL_CLIENT = Symbol('MalClient');
export const MAL_FILLER = Symbol('MalFiller');

@Module({
  providers: [
    { provide: CLOCK, useValue: systemClock },
    { provide: MAL_CONFIG, inject: [ENV], useFactory: loadMalConfig },
    { provide: MAL_STORE, useClass: PostgresMalStore },
    {
      provide: MAL_CLIENT,
      inject: [MAL_CONFIG],
      useFactory: (config: MalConfig | undefined): MalClient | null =>
        config
          ? createMalClient({
              clientId: config.clientId,
              baseUrl: config.baseUrl,
            })
          : null,
    },
    {
      provide: MAL_FILLER,
      inject: [MAL_STORE, MAL_CLIENT, CLOCK],
      useFactory: (
        store: MalStore,
        client: MalClient | null,
        now: Clock,
      ): MalFiller | null =>
        client ? new MalFiller(store, client, now) : null,
    },
  ],
  exports: [MAL_STORE, MAL_FILLER],
})
export class MalModule {}

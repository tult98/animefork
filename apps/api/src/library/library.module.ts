import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.ts';
import { CLOCK, systemClock } from '../common/clock.ts';
import { LibraryController } from './library.controller.ts';
import { LIBRARY_STORE, PostgresLibraryStore } from './library.store.ts';

@Module({
  imports: [AuthModule],
  controllers: [LibraryController],
  providers: [
    { provide: LIBRARY_STORE, useClass: PostgresLibraryStore },
    { provide: CLOCK, useValue: systemClock },
  ],
})
export class LibraryModule {}

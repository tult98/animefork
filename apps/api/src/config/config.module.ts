import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, ENV, loadAppConfig, type Env } from './app.config.ts';

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: (): Env => process.env },
    { provide: APP_CONFIG, inject: [ENV], useFactory: loadAppConfig },
  ],
  exports: [ENV, APP_CONFIG],
})
export class ConfigModule {}

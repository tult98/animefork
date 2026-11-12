import { Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../common/clock.ts';
import { ENV } from '../config/app.config.ts';
import { AUTH_CONFIG, loadAuthConfig } from './auth.config.ts';
import { AuthController } from './auth.controller.ts';
import {
  AUTH_CLEANUP_EVERY_MS,
  AuthService,
  DEFAULT_AUTH_CLEANUP_EVERY_MS,
} from './auth.service.ts';
import { AUTH_STORE, PostgresAuthStore } from './auth.store.ts';
import { createMailer, MAILER } from './mailer.ts';
import { SessionGuard } from './session.guard.ts';

@Module({
  controllers: [AuthController],
  providers: [
    { provide: AUTH_CONFIG, inject: [ENV], useFactory: loadAuthConfig },
    { provide: AUTH_STORE, useClass: PostgresAuthStore },
    { provide: MAILER, inject: [AUTH_CONFIG], useFactory: createMailer },
    { provide: CLOCK, useValue: systemClock },
    {
      provide: AUTH_CLEANUP_EVERY_MS,
      useValue: DEFAULT_AUTH_CLEANUP_EVERY_MS,
    },
    AuthService,
    SessionGuard,
  ],
  exports: [AuthService, SessionGuard, AUTH_STORE],
})
export class AuthModule {}

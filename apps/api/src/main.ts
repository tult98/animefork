import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.ts';
import { configureApp } from './app.setup.ts';
import { APP_CONFIG, type AppConfig } from './config/app.config.ts';

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
  bodyParser: false,
});
const config = app.get<AppConfig>(APP_CONFIG);
configureApp(app, config);
app.enableShutdownHooks();
await app.listen(config.port);
new Logger('api').log(
  `listening on ${config.port}, CORS origins: ${config.allowedOrigins.join(', ') || 'none'}`,
);

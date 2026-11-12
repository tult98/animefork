import type { NestExpressApplication } from '@nestjs/platform-express';
import { bodyParserErrors } from './common/http-error.filter.ts';
import type { AppConfig } from './config/app.config.ts';

export const BODY_LIMIT_BYTES = 64 * 1024;

// The app must be created with `bodyParser: false` so this parser and its error handler come first.
export function configureApp(
  app: NestExpressApplication,
  config: AppConfig,
): NestExpressApplication {
  app.set('trust proxy', config.trustProxy);
  app.useBodyParser('json', { limit: BODY_LIMIT_BYTES });
  app.use(bodyParserErrors);
  app.enableCors({
    origin: config.allowedOrigins.length > 0 ? config.allowedOrigins : false,
    methods: ['GET', 'POST'],
    allowedHeaders: ['content-type'],
    credentials: true,
    maxAge: 600,
  });
  return app;
}

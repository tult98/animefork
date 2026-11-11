import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

const CODES: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'invalid_request',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'body_too_large',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
};

function errorBody(exception: HttpException): object {
  const body = exception.getResponse();
  if (
    typeof body === 'object' &&
    'error' in body &&
    typeof body.error === 'string' &&
    !('statusCode' in body)
  ) {
    return body;
  }
  return { error: CODES[exception.getStatus()] ?? 'http_error' };
}

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<JsonResponse>();
    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json(errorBody(exception));
      return;
    }
    const message =
      exception instanceof Error ? exception.message : String(exception);
    this.logger.error(`request failed: ${message}`);
    res.status(HttpStatus.SERVICE_UNAVAILABLE).json({ error: 'unavailable' });
  }
}

// body-parser fails before Nest routing, so its errors reach Express instead of HttpErrorFilter.
export function bodyParserErrors(
  error: unknown,
  _req: unknown,
  res: JsonResponse,
  next: (error: unknown) => void,
): void {
  const type = (error as { type?: unknown }).type;
  if (type === 'entity.too.large') {
    res.status(HttpStatus.PAYLOAD_TOO_LARGE).json({ error: 'body_too_large' });
  } else if (type === 'entity.parse.failed') {
    res.status(HttpStatus.BAD_REQUEST).json({ error: 'invalid_json' });
  } else {
    next(error);
  }
}

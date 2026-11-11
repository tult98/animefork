import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

const MAX_ISSUES = 10;

export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform {
  private readonly schema: S;

  constructor(schema: S) {
    this.schema = schema;
  }

  transform(value: unknown): z.infer<S> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        error: 'invalid_request',
        issues: parsed.error.issues.slice(0, MAX_ISSUES).map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return parsed.data;
  }
}

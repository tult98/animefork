import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

@Controller()
@SkipThrottle()
export class HealthController {
  @Get('healthz')
  health(): { ok: true } {
    return { ok: true };
  }
}

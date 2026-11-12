import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ZodValidationPipe } from '../common/zod-validation.pipe.ts';
import { AUTH_ROUTE_LIMIT } from './auth.limits.ts';
import { AuthService } from './auth.service.ts';
import {
  CredentialsSchema,
  ME_PATH,
  SIGN_IN_PATH,
  SIGN_OUT_PATH,
  SIGN_UP_PATH,
  VERIFY_EMAIL_PATH,
  VerifyEmailRequestSchema,
  type AuthUser,
  type Credentials,
  type UserResponse,
  type VerifyEmailRequest,
} from './contract.ts';
import { CurrentUser } from './current-user.decorator.ts';
import {
  SessionGuard,
  sessionToken,
  type CookieRequest,
  type HeaderResponse,
} from './session.guard.ts';

const OK = { ok: true } as const;

@Controller()
export class AuthController {
  private readonly auth: AuthService;

  constructor(@Inject(AuthService) auth: AuthService) {
    this.auth = auth;
  }

  @Post(SIGN_UP_PATH)
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: AUTH_ROUTE_LIMIT })
  async signUp(
    @Body(new ZodValidationPipe(CredentialsSchema)) body: Credentials,
  ): Promise<typeof OK> {
    await this.auth.signUp(body.email, body.password);
    return OK;
  }

  @Post(VERIFY_EMAIL_PATH)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_ROUTE_LIMIT })
  async verifyEmail(
    @Body(new ZodValidationPipe(VerifyEmailRequestSchema))
    body: VerifyEmailRequest,
  ): Promise<typeof OK> {
    await this.auth.verifyEmail(body.token);
    return OK;
  }

  @Post(SIGN_IN_PATH)
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: AUTH_ROUTE_LIMIT })
  async signIn(
    @Body(new ZodValidationPipe(CredentialsSchema)) body: Credentials,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<UserResponse> {
    const lockedMs = this.auth.signInLockedForMs(body.email);
    if (lockedMs > 0) {
      response.setHeader('Retry-After', String(Math.ceil(lockedMs / 1000)));
      throw new HttpException(
        { error: 'rate_limited' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const { user, session } = await this.auth.signIn(body.email, body.password);
    response.setHeader('Set-Cookie', this.auth.sessionCookie(session));
    return { user };
  }

  @Post(SIGN_OUT_PATH)
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: HeaderResponse,
  ): Promise<void> {
    await this.auth.signOut(sessionToken(request));
    response.setHeader('Set-Cookie', this.auth.clearedSessionCookie());
  }

  @Get(ME_PATH)
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: AuthUser): UserResponse {
    return { user };
  }
}

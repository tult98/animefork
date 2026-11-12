import {
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { AuthService } from './auth.service.ts';
import { readCookie, SESSION_COOKIE } from './cookie.ts';
import { setCurrentUser } from './current-user.decorator.ts';

export interface CookieRequest {
  headers: { cookie?: string };
}

export interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

export function sessionToken(request: CookieRequest): string | undefined {
  return readCookie(request.headers.cookie, SESSION_COOKIE) || undefined;
}

@Injectable()
export class SessionGuard implements CanActivate {
  private readonly auth: AuthService;

  constructor(@Inject(AuthService) auth: AuthService) {
    this.auth = auth;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<CookieRequest>();
    const response = http.getResponse<HeaderResponse>();
    const found = await this.auth.authenticate(sessionToken(request));
    if (!found) {
      response.setHeader('Set-Cookie', this.auth.clearedSessionCookie());
      throw new UnauthorizedException({ error: 'unauthenticated' });
    }
    if (found.refreshed) {
      response.setHeader(
        'Set-Cookie',
        this.auth.sessionCookie(found.refreshed),
      );
    }
    setCurrentUser(request, found.user);
    return true;
  }
}

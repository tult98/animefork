import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { CLOCK, type Clock } from '../common/clock.ts';
import { AUTH_CONFIG, type AuthConfig } from './auth.config.ts';
import {
  MAILS_PER_EMAIL_LIMIT,
  MAILS_PER_EMAIL_WINDOW_MS,
  PENDING_SIGNUPS_PER_EMAIL,
  SIGN_IN_FAILURE_LIMIT,
  SIGN_IN_FAILURE_WINDOW_MS,
  SlidingWindow,
} from './auth.limits.ts';
import {
  AUTH_STORE,
  type AuthStore,
  type StaleCounts,
  type User,
} from './auth.store.ts';
import { verifyEmailUrl, type AuthUser } from './contract.ts';
import { SESSION_COOKIE, serializeCookie } from './cookie.ts';
import { MAILER, type Mailer, type MailMessage } from './mailer.ts';
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
} from './password.ts';
import { generateToken, hashToken } from './tokens.ts';

const DAY_MS = 24 * 60 * 60_000;

export const SESSION_REFRESH_AFTER_MS = DAY_MS;
export const SESSION_MAX_LIFE_MS = 90 * DAY_MS;
export const SIGNUP_TOKEN_TTL_MS = DAY_MS;

export const AUTH_CLEANUP_EVERY_MS = Symbol('AuthCleanupEveryMs');
export const DEFAULT_AUTH_CLEANUP_EVERY_MS = 60 * 60_000;

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface SignedIn {
  user: AuthUser;
  session: IssuedSession;
}

export interface Authenticated {
  user: AuthUser;
  refreshed: IssuedSession | null;
}

function publicUser(user: User): AuthUser {
  return { id: user.id, email: user.email };
}

function verificationMail(to: string, link: string): MailMessage {
  return {
    to,
    subject: 'Xác nhận email của bạn trên Animefork',
    text: [
      'Chào bạn,',
      '',
      'Bấm vào liên kết dưới đây để xác nhận email và hoàn tất đăng ký tài khoản Animefork:',
      '',
      link,
      '',
      'Liên kết có hiệu lực trong 24 giờ. Nếu bạn không đăng ký, hãy bỏ qua email này.',
    ].join('\n'),
  };
}

@Injectable()
export class AuthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AuthService.name);
  private readonly store: AuthStore;
  private readonly mailer: Mailer;
  private readonly config: AuthConfig;
  private readonly now: Clock;
  private readonly cleanupEveryMs: number | null;
  private readonly mails = new SlidingWindow(
    MAILS_PER_EMAIL_LIMIT,
    MAILS_PER_EMAIL_WINDOW_MS,
  );
  private readonly signInFailures = new SlidingWindow(
    SIGN_IN_FAILURE_LIMIT,
    SIGN_IN_FAILURE_WINDOW_MS,
  );
  private cleanupTimer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(AUTH_STORE) store: AuthStore,
    @Inject(MAILER) mailer: Mailer,
    @Inject(AUTH_CONFIG) config: AuthConfig,
    @Inject(CLOCK) now: Clock,
    @Inject(AUTH_CLEANUP_EVERY_MS) cleanupEveryMs: number | null,
  ) {
    this.store = store;
    this.mailer = mailer;
    this.config = config;
    this.now = now;
    this.cleanupEveryMs = cleanupEveryMs;
  }

  onModuleInit(): void {
    if (!this.cleanupEveryMs) return;
    this.cleanupTimer = setInterval(
      () => void this.runCleanup(),
      this.cleanupEveryMs,
    );
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  async cleanup(): Promise<StaleCounts> {
    const now = this.now();
    this.mails.prune(now);
    this.signInFailures.prune(now);
    return this.store.deleteStale(now);
  }

  private async runCleanup(): Promise<void> {
    try {
      const counts = await this.cleanup();
      this.logger.log(
        `cleanup deleted ${counts.pendingSignups} pending sign-ups and ${counts.sessions} sessions`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`cleanup failed: ${message}`);
    }
  }

  async signUp(email: string, password: string): Promise<void> {
    const webBaseUrl = this.webBaseUrl();
    if (await this.store.findUserByEmail(email)) {
      throw new ConflictException({ error: 'email_taken' });
    }
    const passwordHash = await hashPassword(password);
    const now = this.now();
    if (!this.mails.take(email, now)) return;
    const token = generateToken();
    await this.store.createPendingSignup(
      {
        tokenHash: hashToken(token),
        email,
        passwordHash,
        createdAt: now,
        expiresAt: new Date(now.getTime() + SIGNUP_TOKEN_TTL_MS),
      },
      PENDING_SIGNUPS_PER_EMAIL,
    );
    await this.mailer.send(
      verificationMail(email, verifyEmailUrl(webBaseUrl, token)),
    );
  }

  async verifyEmail(token: string): Promise<void> {
    const user = await this.store.confirmSignup(hashToken(token), this.now());
    if (!user) throw new BadRequestException({ error: 'invalid_token' });
  }

  signInLockedForMs(email: string): number {
    return this.signInFailures.retryAfterMs(email, this.now());
  }

  async signIn(email: string, password: string): Promise<SignedIn> {
    const user = await this.store.findUserByEmail(email);
    const matches = await verifyPassword(
      password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );
    const now = this.now();
    if (!user || !matches) {
      this.signInFailures.add(email, now);
      throw new UnauthorizedException({ error: 'invalid_credentials' });
    }
    this.signInFailures.clear(email);
    return {
      user: publicUser(user),
      session: await this.openSession(user, now),
    };
  }

  async signOut(token: string | undefined): Promise<void> {
    if (token) await this.store.deleteSession(hashToken(token));
  }

  async authenticate(token: string | undefined): Promise<Authenticated | null> {
    if (!token) return null;
    const found = await this.store.findSession(hashToken(token));
    const now = this.now();
    if (!found || found.session.expiresAt <= now) return null;
    const { session, user } = found;
    if (
      now.getTime() - session.lastSeenAt.getTime() <=
      SESSION_REFRESH_AFTER_MS
    ) {
      return { user: publicUser(user), refreshed: null };
    }
    const expiresAt = this.sessionExpiry(session.createdAt, now);
    await this.store.touchSession(session.id, now, expiresAt);
    return { user: publicUser(user), refreshed: { token, expiresAt } };
  }

  sessionCookie(session: IssuedSession): string {
    return serializeCookie(SESSION_COOKIE, session.token, {
      maxAgeSeconds:
        (session.expiresAt.getTime() - this.now().getTime()) / 1000,
      secure: this.config.cookieSecure,
    });
  }

  clearedSessionCookie(): string {
    return serializeCookie(SESSION_COOKIE, '', {
      maxAgeSeconds: 0,
      secure: this.config.cookieSecure,
    });
  }

  private sessionExpiry(createdAt: Date, now: Date): Date {
    return new Date(
      Math.min(
        now.getTime() + this.config.sessionTtlDays * DAY_MS,
        createdAt.getTime() + SESSION_MAX_LIFE_MS,
      ),
    );
  }

  private async openSession(user: User, now: Date): Promise<IssuedSession> {
    const token = generateToken();
    const expiresAt = this.sessionExpiry(now, now);
    await this.store.createSession(user.id, hashToken(token), now, expiresAt);
    return { token, expiresAt };
  }

  private webBaseUrl(): string {
    if (!this.config.webBaseUrl) {
      throw new Error(
        'WEB_BASE_URL is not set and ALLOWED_ORIGINS is empty, so no verification link can be built',
      );
    }
    return this.config.webBaseUrl;
  }
}

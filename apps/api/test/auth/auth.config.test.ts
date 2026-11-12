import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAIL_FROM,
  loadAuthConfig,
} from '../../src/auth/auth.config.ts';
import {
  createMailer,
  LogMailer,
  ResendMailer,
} from '../../src/auth/mailer.ts';

describe('loadAuthConfig', () => {
  it('defaults to a 30 day session, a Secure cookie and the first allowed origin', () => {
    expect(
      loadAuthConfig({ ALLOWED_ORIGINS: ' https://a.test , https://b.test' }),
    ).toEqual({
      sessionTtlDays: 30,
      cookieSecure: true,
      webBaseUrl: 'https://a.test',
      mailFrom: DEFAULT_MAIL_FROM,
      resendApiKey: undefined,
    });
  });

  it('reads every variable and prefers WEB_BASE_URL over the origins', () => {
    expect(
      loadAuthConfig({
        ALLOWED_ORIGINS: 'https://a.test',
        WEB_BASE_URL: 'https://web.test',
        SESSION_TTL_DAYS: '7',
        COOKIE_SECURE: '0',
        MAIL_FROM: 'Me <me@web.test>',
        RESEND_API_KEY: 're_test',
      }),
    ).toEqual({
      sessionTtlDays: 7,
      cookieSecure: false,
      webBaseUrl: 'https://web.test',
      mailFrom: 'Me <me@web.test>',
      resendApiKey: 're_test',
    });
  });

  it('treats blank variables as unset and leaves the base URL unset without origins', () => {
    expect(
      loadAuthConfig({
        SESSION_TTL_DAYS: '',
        COOKIE_SECURE: '',
        WEB_BASE_URL: '',
        MAIL_FROM: '',
        RESEND_API_KEY: '',
      }),
    ).toEqual({
      sessionTtlDays: 30,
      cookieSecure: true,
      webBaseUrl: undefined,
      mailFrom: DEFAULT_MAIL_FROM,
      resendApiKey: undefined,
    });
  });

  it.each([
    { SESSION_TTL_DAYS: '0' },
    { SESSION_TTL_DAYS: '1.5' },
    { COOKIE_SECURE: 'false' },
    { WEB_BASE_URL: 'not a url' },
  ])('refuses %o', (env) => {
    expect(() => loadAuthConfig(env)).toThrow(/missing or invalid env/);
  });

  it('logs mail by default', () => {
    expect(createMailer(loadAuthConfig({}))).toBeInstanceOf(LogMailer);
  });

  it('sends through Resend when a key is set', () => {
    expect(
      createMailer(loadAuthConfig({ RESEND_API_KEY: 're_test' })),
    ).toBeInstanceOf(ResendMailer);
  });
});

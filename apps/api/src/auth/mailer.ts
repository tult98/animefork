import { Logger } from '@nestjs/common';
import type { AuthConfig } from './auth.config.ts';

export const MAILER = Symbol('Mailer');

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export class LogMailer implements Mailer {
  private readonly logger = new Logger('Mailer');
  private readonly from: string;

  constructor(from: string) {
    this.from = from;
  }

  async send(message: MailMessage): Promise<void> {
    this.logger.log(
      `not sent, no mail provider: from ${this.from} to ${message.to}: ${message.subject}`,
    );
  }
}

export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

export const RESEND_API_URL = 'https://api.resend.com/emails';

export class ResendMailer implements Mailer {
  private readonly apiKey: string;
  private readonly from: string;
  private readonly fetchFn: typeof fetch;

  constructor(apiKey: string, from: string, fetchFn: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.from = from;
    this.fetchFn = fetchFn;
  }

  async send(message: MailMessage): Promise<void> {
    const response = await this.fetchFn(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Resend answered ${response.status}`);
    }
  }
}

export function createMailer(config: AuthConfig): Mailer {
  if (config.resendApiKey) {
    return new ResendMailer(config.resendApiKey, config.mailFrom);
  }
  return new LogMailer(config.mailFrom);
}

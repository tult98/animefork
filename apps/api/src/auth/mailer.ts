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

export function createMailer(config: AuthConfig): Mailer {
  return new LogMailer(config.mailFrom);
}

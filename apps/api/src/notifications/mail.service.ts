import { Inject, Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import type { RenderedEmail } from './templates';

/**
 * Mail abstraction. Uses SMTP when SMTP_HOST is set (Mailpit locally, any provider in
 * production); otherwise logs a one-line summary so development works without a mail server.
 * Sending never throws: callers get `false` and carry on (an RSVP must not fail because email did).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter | null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    const smtp = config.smtp;
    this.transporter = smtp.host
      ? nodemailer.createTransport({
          host: smtp.host,
          port: smtp.port,
          secure: smtp.secure,
          auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        })
      : null;
  }

  get enabled(): boolean {
    return this.transporter !== null;
  }

  async send(to: string, email: RenderedEmail): Promise<boolean> {
    if (!this.transporter) {
      this.logger.log(`Email not sent (SMTP_HOST unset): "${email.subject}" to ${this.mask(to)}`);
      return false;
    }
    try {
      await this.transporter.sendMail({ from: this.config.smtp.from, to, subject: email.subject, html: email.html, text: email.text });
      return true;
    } catch (error) {
      this.logger.error(`Email "${email.subject}" to ${this.mask(to)} failed: ${(error as Error).message}`);
      return false;
    }
  }

  /** Fire-and-forget notification to the configured admin address, if any. */
  notifyAdmin(email: RenderedEmail): void {
    if (this.config.adminNotifyEmail) void this.send(this.config.adminNotifyEmail, email);
  }

  private mask(address: string): string {
    const [local, domain] = address.split('@');
    return `${local.slice(0, 2)}***@${domain ?? ''}`;
  }
}

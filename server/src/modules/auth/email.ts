import { appendFileSync } from 'node:fs';
import type { Config } from '../../config.ts';
import { logger } from '../../logger.ts';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<void>;
}

/** Development: prints the email (with its link) to the server log. Refused in production by config. */
export class LogEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage): Promise<void> {
    this.sent.push(msg);
    logger.info({ to: msg.to, subject: msg.subject }, `EMAIL (dev log transport)\n${msg.text}`);
  }
}

/** End-to-end tests: one JSON line per email in a file the test runner reads. Refused in production by config. */
export class FileEmailSender implements EmailSender {
  constructor(private readonly path: string) {}
  async send(msg: EmailMessage): Promise<void> {
    appendFileSync(this.path, JSON.stringify({ at: new Date().toISOString(), ...msg }) + '\n');
  }
}

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async send(msg: EmailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: msg.to, subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) throw new Error(`email send failed: HTTP ${res.status}`);
  }
}

export function createEmailSender(config: Config): EmailSender {
  if (config.EMAIL_TRANSPORT === 'resend') return new ResendEmailSender(config.RESEND_API_KEY, config.EMAIL_FROM);
  if (config.EMAIL_TRANSPORT === 'file') return new FileEmailSender(config.EMAIL_OUTBOX);
  return new LogEmailSender();
}

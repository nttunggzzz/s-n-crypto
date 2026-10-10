import type { MarketStatus } from '@cex/contracts';
import { logger } from '../logger.ts';

/**
 * Operator alerts (P01): Telegram when TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID are set, the log otherwise.
 * Each alert has a key; the same key is sent at most once per cooldown (a stuck feed does not spam).
 * Sending never throws — an alert must not take the exchange down.
 */
export type AlertLevel = 'info' | 'warn' | 'critical';

export interface AlertSink {
  (text: string): Promise<void>;
}

export function telegramSink(token: string, chatId: string, fetchImpl: typeof fetch = fetch): AlertSink {
  return async (text) => {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`telegram HTTP ${res.status}`);
  };
}

const ICON: Record<AlertLevel, string> = { info: 'ℹ️', warn: '⚠️', critical: '🚨' };

export class Alerter {
  private readonly lastSent = new Map<string, number>();

  constructor(
    private readonly sink: AlertSink | null,
    /** Shown first in every message, e.g. "staging". */
    private readonly envName: string,
    private readonly cooldownMs = 30 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Sends unless `key` was sent within the cooldown; `force` skips the cooldown (recoveries, start-up). */
  async send(key: string, level: AlertLevel, text: string, force = false): Promise<void> {
    const t = this.now();
    const last = this.lastSent.get(key);
    if (!force && last !== undefined && t - last < this.cooldownMs) return;
    this.lastSent.set(key, t);
    const message = `${ICON[level]} [${this.envName}] ${text}`;
    (level === 'info' ? logger.info : logger.warn).call(logger, { alert: key }, message);
    if (!this.sink) return;
    try {
      await this.sink(message);
    } catch (err) {
      logger.error({ err, alert: key }, 'could not send the alert');
    }
  }
}

/**
 * Watches a market feed (spot or futures) and alerts when it has been unhealthy for `graceMs`:
 * disconnected, or more than `maxStaleShare` of the pairs not LIVE (no matching / liquidations then).
 * Sends one "recovered" message when it is healthy again. Call `check()` periodically.
 */
export class FeedWatcher {
  private badSince: number | null = null;
  private alerted = false;

  constructor(
    private readonly name: string,
    private readonly status: () => MarketStatus,
    private readonly alerter: Alerter,
    private readonly opts: { graceMs?: number; maxStaleShare?: number; now?: () => number } = {},
  ) {}

  async check(): Promise<void> {
    const now = (this.opts.now ?? Date.now)();
    const s = this.status();
    const notLive = s.symbols.filter((x) => x.status !== 'LIVE').length;
    const share = s.symbols.length ? notLive / s.symbols.length : 1;
    const bad = s.connection !== 'CONNECTED' || share > (this.opts.maxStaleShare ?? 0.2);
    if (!bad) {
      this.badSince = null;
      if (this.alerted) {
        this.alerted = false;
        await this.alerter.send(`feed:${this.name}`, 'info', `${this.name}: giá đã hoạt động lại (${s.symbols.length - notLive}/${s.symbols.length} cặp LIVE).`, true);
      }
      return;
    }
    this.badSince ??= now;
    if (!this.alerted && now - this.badSince >= (this.opts.graceMs ?? 120_000)) {
      this.alerted = true;
      const mins = Math.round((now - this.badSince) / 60_000);
      await this.alerter.send(
        `feed:${this.name}`,
        'critical',
        `${this.name}: dữ liệu giá gián đoạn ${mins} phút — kết nối ${s.connection}, ${notLive}/${s.symbols.length} cặp không LIVE. Sàn không khớp lệnh các cặp này.`,
        true,
      );
    }
  }
}

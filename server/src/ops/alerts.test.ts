import { describe, expect, it } from 'vitest';
import type { MarketStatus } from '@cex/contracts';
import { Alerter, FeedWatcher, telegramSink } from './alerts.ts';
import { loadConfig } from '../config.ts';

const clock = () => {
  const c = { t: 1_000_000, now: () => c.t };
  return c;
};

describe('Alerter', () => {
  it('one message per key per cooldown; force (recoveries, start-up) skips it; env name in front', async () => {
    const sent: string[] = [];
    const c = clock();
    const a = new Alerter(async (text) => void sent.push(text), 'staging', 60_000, c.now);
    await a.send('recon', 'critical', 'lệch');
    await a.send('recon', 'critical', 'lệch');
    c.t += 61_000;
    await a.send('recon', 'critical', 'lệch');
    await a.send('recon', 'info', 'ổn', true);
    expect(sent).toEqual(['🚨 [staging] lệch', '🚨 [staging] lệch', 'ℹ️ [staging] ổn']);
  });

  it('a failing sink never throws (alerts must not take the exchange down)', async () => {
    const a = new Alerter(async () => {
      throw new Error('telegram down');
    }, 'staging');
    await expect(a.send('x', 'warn', 'y')).resolves.toBeUndefined();
  });

  it('Telegram request: bot token in the URL, chat id + text in the body', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response('{}', { status: 200 });
    }) as typeof fetch;
    await telegramSink('123:abc', '-100777', fake)('xin chào');
    expect(calls).toEqual([{ url: 'https://api.telegram.org/bot123:abc/sendMessage', body: { chat_id: '-100777', text: 'xin chào', disable_web_page_preview: true } }]);
  });
});

describe('config', () => {
  it('Telegram token and chat id go together', () => {
    expect(() => loadConfig({ TELEGRAM_BOT_TOKEN: '123:abc' })).toThrow(/go together/);
    expect(loadConfig({ TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '-1' }).TELEGRAM_CHAT_ID).toBe('-1');
  });
});

describe('FeedWatcher', () => {
  const status = (connection: MarketStatus['connection'], live: number, total = 10): MarketStatus => ({
    connection,
    staleThresholdMs: 5000,
    symbols: Array.from({ length: total }, (_, i) => ({ symbol: `S${i}USDT`, status: i < live ? 'LIVE' : 'STALE', lastUpdateAt: null })),
  });

  it('alerts once after the grace period, then once when the feed is back; short blips stay quiet', async () => {
    const sent: string[] = [];
    const c = clock();
    let s = status('CONNECTED', 10);
    const w = new FeedWatcher('Giá Spot', () => s, new Alerter(async (t) => void sent.push(t), 'staging', 60_000, c.now), { graceMs: 120_000, now: c.now });

    s = status('DISCONNECTED', 0);
    await w.check();
    c.t += 60_000;
    s = status('CONNECTED', 10); // came back within the grace period
    await w.check();
    expect(sent).toEqual([]);

    s = status('CONNECTED', 5); // half the pairs stale
    await w.check();
    c.t += 119_000;
    await w.check();
    expect(sent).toEqual([]);
    c.t += 2_000;
    await w.check();
    await w.check();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain('5/10 cặp không LIVE');

    s = status('CONNECTED', 9); // 10 % stale is fine
    await w.check();
    expect(sent).toHaveLength(2);
    expect(sent[1]).toContain('hoạt động lại');
  });
});

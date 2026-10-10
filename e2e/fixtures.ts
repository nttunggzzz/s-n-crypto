import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Page } from '@playwright/test';

/** What the page sent to / was refused by the realtime server (`/ws`). */
export interface RealtimeLog {
  subscribed: string[];
  refused: string[];
}

function watchRealtime(page: Page, log: RealtimeLog): void {
  page.on('websocket', (ws) => {
    if (!ws.url().endsWith('/ws')) return;
    ws.on('framesent', ({ payload }) => {
      const m = parse(payload);
      if (m?.type === 'subscribe' && typeof m.channel === 'string') log.subscribed.push(m.channel);
    });
    ws.on('framereceived', ({ payload }) => {
      const m = parse(payload);
      if (m?.type === 'error') log.refused.push(`${String(m.code)} ${String(m.channel ?? '')}`.trim());
    });
  });
}
const parse = (payload: string | Buffer): Record<string, unknown> | null => {
  try {
    return JSON.parse(String(payload)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * Every test fails if the page logs an error, throws, if any API call returns 5xx or
 * VALIDATION_ERROR (= the UI sent something the contract does not allow), or if the realtime
 * server refuses a subscription (unknown channel, too many channels). 401 before signing in is fine.
 */
export const test = base.extend<{ guard: void; realtime: RealtimeLog }>({
  realtime: async ({ page }, use) => {
    const log: RealtimeLog = { subscribed: [], refused: [] };
    watchRealtime(page, log);
    await use(log);
  },
  guard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      const rt: RealtimeLog = { subscribed: [], refused: [] };
      watchRealtime(page, rt);
      page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/status of 401/.test(m.text())) problems.push(`console: ${m.text()}`);
      });
      page.on('response', async (r) => {
        const u = new URL(r.url());
        if (!u.pathname.startsWith('/api/')) return;
        if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.request().method()} ${u.pathname}`);
        if (r.status() === 400) {
          const body = (await r.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
          if (body?.error?.code === 'VALIDATION_ERROR') problems.push(`contract violation: ${r.request().method()} ${u.pathname}${u.search} → ${body.error.message}`);
        }
      });
      await use();
      problems.push(...rt.refused.map((r) => `realtime subscription refused: ${r}`));
      expect(problems, 'browser errors / API contract violations / refused realtime channels').toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

/** Text that must never be shown to a user (formatting bugs). */
export async function expectCleanText(page: Page): Promise<void> {
  const text = await page.locator('body').innerText();
  for (const bad of ['NaN', 'undefined', '[object Object]', 'Infinity']) expect(text, `page shows "${bad}"`).not.toContain(bad);
}

const OUTBOX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.e2e/outbox.jsonl');

/** The newest link of `kind` emailed to `to` (the e2e server writes emails to a file). */
export async function emailLink(to: string, kind: 'verify-email' | 'reset-password'): Promise<string> {
  for (let i = 0; i < 50; i++) {
    if (existsSync(OUTBOX)) {
      const mails = readFileSync(OUTBOX, 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { to: string; text: string })
        .filter((m) => m.to === to);
      const link = mails.reverse().map((m) => new RegExp(`https?://[^\\s]+/${kind}\\?token=[\\w-]+`).exec(m.text)?.[0]).find(Boolean);
      if (link) return new URL(link).pathname + new URL(link).search;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no ${kind} email for ${to}`);
}

/** A fresh test account on the local e2e server (generated, never a real address). */
export function newAccount() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return { email: `e2e-${id}@example.test`, name: 'Kiểm thử E2E', password: `E2e-${id}-pw` };
}

/** Signs a fresh, verified test account in through the API (cookies land in the page's context). */
export async function signUp(page: Page): Promise<ReturnType<typeof newAccount> & { id: string; uid: string }> {
  const acc = newAccount();
  const reg = await page.request.post('/api/v1/auth/register', { data: { email: acc.email, password: acc.password, name: acc.name } });
  expect(reg.status(), await reg.text()).toBe(201);
  const token = new URL(await emailLink(acc.email, 'verify-email'), 'http://x').searchParams.get('token');
  expect((await page.request.post('/api/v1/auth/verify-email', { data: { token } })).ok()).toBe(true);
  const me = (await (await page.request.get('/api/v1/me')).json()) as { id: string; uid: string };
  return { ...acc, id: me.id, uid: me.uid };
}


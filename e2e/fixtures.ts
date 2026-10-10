import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect, type Browser, type Page } from '@playwright/test';
import { base32Decode, hotp, totpStep } from '../server/src/modules/auth/totp.ts';

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

/** Reads the API as the page's signed-in user — to check what the UI really did. */
export async function apiGet<T>(page: Page, path: string): Promise<T> {
  const r = await page.request.get(path);
  expect(r.ok(), `GET ${path} → ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()) as T;
}

/** Calls the API as the page's user (test setup only — the flow under test goes through the UI). */
export async function apiPost<T>(page: Page, path: string, data: unknown = {}): Promise<T> {
  const r = await page.request.post(path, { data });
  expect(r.ok(), `POST ${path} → ${r.status()} ${await r.text()}`).toBe(true);
  return (await r.json()) as T;
}

/** `value` rounded to a multiple of `step` (e.g. a price to the pair's tickSize), as the API string. */
export function toStep(value: number, step: string): string {
  const decimals = step.includes('.') ? step.replace(/0+$/, '').split('.')[1]!.length : 0;
  const n = Math.round(value / Number(step)) * Number(step);
  return n.toFixed(decimals);
}


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A fresh test account made staff (`support` | `admin` | `owner`) the way an operator does it: the
 * `admin:set-role` command on the e2e database, then 2FA turned on through the API (staff need it;
 * enabling it marks the current session as 2FA-verified). The page's cookies are that staff session.
 * Test credentials only, local e2e server only.
 */
export async function signUpStaff(page: Page, role: 'support' | 'admin' | 'owner' = 'admin') {
  const acc = await signUp(page);
  const { databaseUrl } = JSON.parse(readFileSync(path.join(ROOT, '.e2e/stack.json'), 'utf8')) as { databaseUrl: string };
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/setRole.ts', acc.email, role], {
    cwd: path.join(ROOT, 'server'),
    env: { ...process.env, DATABASE_URL: databaseUrl, NODE_ENV: 'development', LOG_LEVEL: 'warn' },
    stdio: 'pipe',
  });
  const setup = await apiPost<{ secret: string }>(page, '/api/v1/auth/2fa/setup', { currentPassword: acc.password });
  await apiPost(page, '/api/v1/auth/2fa/enable', { code: hotp(base32Decode(setup.secret), totpStep(Date.now())) });
  return { ...acc, role };
}

/** A second, separate browser (own cookies) on the same server — e.g. the user while the admin acts. */
export async function otherBrowser(browser: Browser, baseURL: string | undefined): Promise<Page> {
  const ctx = await browser.newContext({ baseURL, locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', viewport: { width: 1440, height: 900 } });
  return ctx.newPage();
}

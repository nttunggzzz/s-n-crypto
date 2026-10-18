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
 * An API refusal a test provokes on purpose (e.g. signing up without an invite code): the browser's
 * "Failed to load resource: … status of <status>" console error for that call is not a failure, as long as
 * the server answered with exactly this error `code`. Set per test with `test.use({ expectedApiErrors: [...] })`
 * inside a `test.describe`, so every other test keeps the full guard.
 */
export interface ExpectedApiError {
  method: string;
  path: string;
  status: number;
  code: string;
}

/**
 * An entry of `expectedApiErrors`: the object above, or the same thing as one string `"METHOD /path STATUS CODE"`
 * (e.g. `"GET /api/v1/admin/overview 403 TWO_FACTOR_REQUIRED"`).
 * Use strings when a list has two or more entries: Playwright reads ANY array whose second element is an object as a
 * fixture tuple `[value, options]` (so `test.use({ expectedApiErrors: [{…}, {…}] })` hands the fixture a single object and it
 * fails with "expectedApiErrors.find is not a function"). Strings are never taken for fixture options.
 */
export type ExpectedApiErrorSpec = ExpectedApiError | string;

/** `"GET /api/v1/admin/overview 403 TWO_FACTOR_REQUIRED"` → the object form (a malformed string is a test bug: throws). */
export function parseExpectedApiError(spec: ExpectedApiErrorSpec): ExpectedApiError {
  if (typeof spec !== 'string') return spec;
  const m = /^(GET|POST|PUT|PATCH|DELETE)\s+(\/\S*)\s+(\d{3})\s+([A-Z][A-Z0-9_]*)$/.exec(spec.trim());
  if (!m) throw new Error(`expectedApiErrors: "${spec}" — expected "METHOD /path STATUS CODE", e.g. "GET /api/v1/admin/overview 403 TWO_FACTOR_REQUIRED"`);
  return { method: m[1]!, path: m[2]!, status: Number(m[3]), code: m[4]! };
}

/**
 * Every test fails if the page logs an error, throws, if any API call returns 5xx or
 * VALIDATION_ERROR (= the UI sent something the contract does not allow), or if the realtime
 * server refuses a subscription (unknown channel, too many channels). 401 before signing in is fine,
 * and so are the refusals the test declared in `expectedApiErrors`.
 */
export const test = base.extend<{ guard: void; realtime: RealtimeLog; expectedApiErrors: ExpectedApiErrorSpec[] }>({
  expectedApiErrors: [[], { option: true }],
  realtime: async ({ page }, use) => {
    const log: RealtimeLog = { subscribed: [], refused: [] };
    watchRealtime(page, log);
    await use(log);
  },
  guard: [
    async ({ page, expectedApiErrors: declared }, use) => {
      const expectedApiErrors = declared.map(parseExpectedApiError);
      const problems: string[] = [];
      const rt: RealtimeLog = { subscribed: [], refused: [] };
      watchRealtime(page, rt);
      // the console error of a failed request names the status; its location is the request URL
      const expectedConsole = (text: string, url: string) => {
        const status = Number(/status of (\d{3})/.exec(text)?.[1]);
        if (!status) return false;
        const pathname = URL.canParse(url) ? new URL(url).pathname : '';
        return expectedApiErrors.some((e) => e.status === status && e.path === pathname);
      };
      page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
      page.on('console', (m) => {
        if (m.type() === 'error' && !/status of 401/.test(m.text()) && !expectedConsole(m.text(), m.location().url)) problems.push(`console: ${m.text()}`);
      });
      page.on('response', async (r) => {
        const u = new URL(r.url());
        if (!u.pathname.startsWith('/api/')) return;
        if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.request().method()} ${u.pathname}`);
        const expected = expectedApiErrors.find((e) => e.status === r.status() && e.method === r.request().method() && e.path === u.pathname);
        if (r.status() === 400 || expected) {
          const body = (await r.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
          if (body?.error?.code === 'VALIDATION_ERROR') problems.push(`contract violation: ${r.request().method()} ${u.pathname}${u.search} → ${body.error.message}`);
          else if (expected && body?.error?.code !== expected.code) problems.push(`HTTP ${r.status()} ${r.request().method()} ${u.pathname}: ${body?.error?.code ?? 'no error code'}, expected only ${expected.code}`);
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

/** `stack.json` of an e2e stack (server/scripts/e2eStack.ts): default = :5190, host = host mode on :5191. */
function stackInfo(stack: 'default' | 'host'): { databaseUrl: string; appUrl: string } {
  return JSON.parse(readFileSync(path.join(ROOT, stack === 'host' ? '.e2e/host' : '.e2e', 'stack.json'), 'utf8')) as { databaseUrl: string; appUrl: string };
}

/**
 * A fresh sign-up invite on the host-mode stack, made the way the operator does it (`npm run admin:invite`,
 * i.e. scripts/createInvite.ts on that database). `link` is what the operator sends: `<app>/register?invite=<code>`.
 */
export function createInvite(note = 'Kiểm thử E2E', maxUses = 1): { code: string; link: string } {
  const { databaseUrl, appUrl } = stackInfo('host');
  const out = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/createInvite.ts', note, String(maxUses), '1'], {
    cwd: path.join(ROOT, 'server'),
    env: { ...process.env, DATABASE_URL: databaseUrl, APP_URL: appUrl, NODE_ENV: 'development', REGISTRATION: 'invite', LOG_LEVEL: 'warn' },
    encoding: 'utf8',
    stdio: 'pipe',
  });
  const code = /^code: (\S+)$/m.exec(out)?.[1];
  const link = /^link: (\S+)$/m.exec(out)?.[1];
  if (!code || !link) throw new Error(`createInvite.ts printed no code/link:\n${out}`);
  return { code, link };
}

/**
 * A fresh test account made staff (`support` | `admin` | `owner`) the way an operator does it: the
 * `admin:set-role` command on the e2e database, then 2FA turned on through the API (staff need it;
 * enabling it marks the current session as 2FA-verified). The page's cookies are that staff session.
 * Test credentials only, local e2e server only.
 */
export async function signUpStaff(page: Page, role: 'support' | 'admin' | 'owner' = 'admin') {
  const acc = await signUp(page);
  const { databaseUrl } = stackInfo('default');
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

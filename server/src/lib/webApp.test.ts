import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiHarness } from '../../test/apiHarness.ts';
import { webApp } from './webApp.ts';

const dist = mkdtempSync(path.join(tmpdir(), 'cex-web-'));
const h = new ApiHarness();

beforeAll(async () => {
  mkdirSync(path.join(dist, 'assets'));
  writeFileSync(path.join(dist, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(path.join(dist, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(path.join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /');
  await h.start({ webDist: dist });
});
afterAll(async () => {
  await h.stop();
  rmSync(dist, { recursive: true, force: true });
});

const get = (p: string, accept = 'text/html') => fetch(h.base + p, { headers: { accept } });

describe('the web app on the API origin (WEB_DIST)', () => {
  it('any page path returns index.html, never cached', async () => {
    for (const p of ['/', '/trade/BTCUSDT', '/futures/1000PEPEUSDT', '/assets']) {
      const r = await get(p);
      expect(r.status, p).toBe(200);
      expect(r.headers.get('content-type')).toContain('text/html');
      expect(r.headers.get('cache-control')).toBe('no-cache');
      expect(await r.text()).toContain('id="root"');
    }
  });

  it('hashed assets are cached for a year; a missing asset is 404, not the page', async () => {
    const js = await get('/assets/index-abc123.js', '*/*');
    expect(js.status).toBe(200);
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect((await get('/assets/gone-123.js', '*/*')).status).toBe(404);
    const robots = await get('/robots.txt', '*/*');
    expect(await robots.text()).toContain('Disallow');
  });

  it('never answers /api or /ws: unknown API paths stay JSON 404s, the API still works', async () => {
    const r = await get('/api/v1/nope');
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect((await get('/api/v1/health', 'application/json')).status).toBe(200);
    expect((await get('/ws')).status).toBe(404);
  });

  it('refuses to start without a build', () => {
    expect(() => webApp(path.join(dist, 'nothing-here'))).toThrow(/index.html/);
  });
});

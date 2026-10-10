import { describe, expect, it } from 'vitest';
import { ADMIN_BASE_PATH, appLinks, canOpenAdmin, safeNext } from './apps.ts';

describe('links between the exchange app and the admin app', () => {
  it('same origin in production (paths only); the other dev server origin when given', () => {
    expect(appLinks.admin.home()).toBe(`${ADMIN_BASE_PATH}/`);
    expect(appLinks.admin.user('42')).toBe('/admin/users/42');
    expect(appLinks.exchange.trade('BTCUSDT')).toBe('/trade/BTCUSDT');
    expect(appLinks.exchange.futures('1000PEPEUSDT', 'http://localhost:5173/')).toBe('http://localhost:5173/futures/1000PEPEUSDT');
    expect(appLinks.admin.home('http://localhost:5174')).toBe('http://localhost:5174/admin/');
    expect(appLinks.exchange.register('ABCD-EFGH-JKMN')).toBe('/register?invite=ABCD-EFGH-JKMN');
  });

  it('only staff see the way into the admin app', () => {
    expect(canOpenAdmin(null)).toBe(false);
    expect(canOpenAdmin({ role: 'user' })).toBe(false);
    for (const role of ['support', 'admin', 'owner'] as const) expect(canOpenAdmin({ role })).toBe(true);
  });
});

describe('sign in once, then back to the app that asked', () => {
  it('the admin app sends staff to the exchange sign-in with next=/admin/', () => {
    expect(appLinks.exchange.login(appLinks.admin.home())).toBe('/login?next=%2Fadmin%2F');
  });

  it('accepts same-origin paths and the allowed dev origins only', () => {
    expect(safeNext('/admin/')).toBe('/admin/');
    expect(safeNext('/trade/BTCUSDT')).toBe('/trade/BTCUSDT');
    expect(safeNext('http://localhost:5174/admin/', ['http://localhost:5174'])).toBe('http://localhost:5174/admin/');
    for (const bad of ['//evil.example/x', '/\\evil.example', 'https://evil.example/admin/', 'javascript:alert(1)', 'admin', '']) expect(safeNext(bad, ['http://localhost:5174']), bad).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});


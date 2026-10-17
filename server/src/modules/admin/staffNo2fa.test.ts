import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '@cex/contracts';
import { loadConfig } from '../../config.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';

// STAFF_REQUIRE_2FA=false (development only, owner decision 2026-10-17 until the security work is redone): staff endpoints
// check role + permission without 2FA. Everything else of the staff gate stays.
const h = new ApiHarness();
beforeAll(async () => {
  await h.start({ env: { STAFF_REQUIRE_2FA: 'false' } });
});
afterAll(async () => {
  await h.stop();
});
const err = (code: string, status: number) => (e: unknown) => e instanceof ApiError && e.code === code && e.status === status;

describe('staff gate without 2FA (dev flag)', () => {
  it('publicConfig says so; staff without 2FA reaches admin endpoints; a user is still 403; permissions still apply', async () => {
    expect((await h.browser().publicConfig()).staffTwoFactorRequired).toBe(false);
    const admin = await h.user('admin');
    expect((await admin.b.adminOverview()).users).toBeDefined();
    const plain = await h.user();
    await expect(plain.b.adminOverview()).rejects.toSatisfy(err('FORBIDDEN', 403));
    const support = await h.user('support');
    await expect(support.b.adminUpdateTaxSettings({ body: { taxMode: 'OFF', reason: 'support may not change tax' } })).rejects.toSatisfy(err('FORBIDDEN', 403));
  });

  it('is refused in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', STAFF_REQUIRE_2FA: 'false', DATA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'), EMAIL_TRANSPORT: 'log', REGISTRATION: 'invite' })).toThrow(/STAFF_REQUIRE_2FA/);
  });
});

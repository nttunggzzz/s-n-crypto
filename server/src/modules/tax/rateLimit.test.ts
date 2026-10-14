import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '@cex/contracts';
import { ApiHarness } from '../../../test/apiHarness.ts';

/**
 * T3F item 8: taxSummary is rate limited per user like taxExport (own file: RATE_LIMIT_SCALE=1, the other tax tests run at 100).
 * The summary is 30 per minute and user; the other reads are not counted against it.
 */
const h = new ApiHarness();

beforeAll(async () => {
  await h.start({ env: { RATE_LIMIT_SCALE: '1' } });
});
afterAll(async () => {
  await h.stop();
});

describe('taxSummary rate limit', () => {
  it('the 31st summary within a minute is RATE_LIMITED (429); another user is not affected; list and profile are not counted', async () => {
    const a = await h.user();
    const b = await h.user();
    for (let i = 0; i < 30; i++) await a.b.taxSummary({ query: {} });
    await expect(a.b.taxSummary({ query: {} })).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === 'RATE_LIMITED' && e.status === 429);
    // A is limited only on the summary
    await a.b.taxWithholdings({ query: { limit: 5 } });
    await a.b.taxProfile();
    // B has its own counter
    await b.b.taxSummary({ query: {} });
  });
});

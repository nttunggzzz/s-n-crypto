import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dec } from '@cex/core';
import { marketTrade, setBook } from '../../../test/helpers.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';

/** P-03 / P-04 (0.18.0): `pnlAnalysis.spotTax` and `adminGetUser.tax`. Responses are validated against the contract. */
const h = new ApiHarness();

beforeAll(async () => {
  await h.start();
});
afterAll(async () => {
  await h.stop();
});
beforeEach(async () => {
  h.env.clock.ms = Date.now();
  setBook(h.env, 'BTCUSDT', [['99.00', '10.00000']], [['100.00', '10.00000']]);
  marketTrade(h.env, 'BTCUSDT', '99.50');
});

/** A fresh user buys 1 BTC and sells 0.5 BTC at market (same book every time → same gross result before tax). */
async function tradeOnce() {
  const u = await h.user();
  await u.b.faucetClaim({ body: {} });
  await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' } });
  await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.5' } });
  return u;
}

describe('spotTax in the PnL analysis (P-03)', () => {
  it('tax off: spotTax is 0; tax on: spotRealized is lower by exactly spotTax, and spotTax = the fill tax', async () => {
    const admin = await h.staff('admin');
    await admin.b.adminUpdateTaxSettings({ body: { taxMode: 'OFF', reason: 'p-03 baseline off' } });
    const off = await tradeOnce();
    const pOff = await off.b.pnlAnalysis({ query: { range: 'all' } });
    expect(pOff.spotTax).toBe('0.00000000');

    await admin.b.adminUpdateTaxSettings({ body: { taxMode: 'WITHHOLD', taxRate: '0.001', reason: 'p-03 tax on' } });
    try {
      const on = await tradeOnce();
      const pOn = await on.b.pnlAnalysis({ query: { range: 'all' } });
      expect(pOn.spotTax).toBe('0.04950000'); // 0.5 × 99 × 0.001
      expect(dec(pOff.spotRealized).sub(pOn.spotRealized).toFixed(8), 'spotRealized is after tax').toBe(pOn.spotTax);
      expect(dec(pOn.totalRealized).toFixed(8)).toBe(dec(pOn.spotRealized).add(pOn.futuresRealized).toFixed(8));
    } finally {
      await admin.b.adminUpdateTaxSettings({ body: { taxMode: 'OFF', reason: 'p-03 back to off' } });
    }
  });
});

describe('admin user detail: tax overview (P-04)', () => {
  it('no tax yet → INDIVIDUAL, never chosen, 0 records; after a withheld SELL and a category change it shows both', async () => {
    const admin = await h.staff('admin');
    const u = await h.user();
    const before = await admin.b.adminGetUser({ params: { userId: u.id } });
    expect(before.tax).toEqual({ category: 'INDIVIDUAL', categoryUpdatedAt: null, withheldCount: 0, withheldTotal: '0.00000000' });

    await admin.b.adminUpdateTaxSettings({ body: { taxMode: 'WITHHOLD', taxRate: '0.001', reason: 'p-04 tax on' } });
    try {
      await u.b.faucetClaim({ body: {} });
      await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' } });
      await u.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.5' } });
      await u.b.taxUpdateProfile({ body: { category: 'FOREIGN_ORG' } });
      const after = await admin.b.adminGetUser({ params: { userId: u.id } });
      expect(after.tax).toMatchObject({ category: 'FOREIGN_ORG', withheldCount: 1, withheldTotal: '0.04950000' });
      expect(after.tax.categoryUpdatedAt).not.toBeNull();
      // the total is the sum of the records the admin can list
      const list = await admin.b.adminTaxWithholdings({ query: { userId: u.id, limit: 50 } });
      expect(list.items.reduce((s, r) => s.add(r.taxAmount), dec('0')).toFixed(8)).toBe(after.tax.withheldTotal);
    } finally {
      await admin.b.adminUpdateTaxSettings({ body: { taxMode: 'OFF', reason: 'p-04 back to off' } });
    }
  });

  it("one user's tax never shows in another user's detail", async () => {
    const admin = await h.staff('admin');
    await admin.b.adminUpdateTaxSettings({ body: { taxMode: 'WITHHOLD', taxRate: '0.001', reason: 'p-04 isolation on' } });
    try {
      const seller = await tradeOnce();
      const other = await h.user();
      expect((await admin.b.adminGetUser({ params: { userId: other.id } })).tax.withheldCount).toBe(0);
      expect((await admin.b.adminGetUser({ params: { userId: seller.id } })).tax.withheldCount).toBe(1);
    } finally {
      await admin.b.adminUpdateTaxSettings({ body: { taxMode: 'OFF', reason: 'p-04 back to off' } });
    }
  });
});

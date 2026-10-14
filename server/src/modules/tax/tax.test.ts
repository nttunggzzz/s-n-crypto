import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, desc, eq, sql } from 'drizzle-orm';
import { ApiError } from '@cex/contracts';
import { dec } from '@cex/core';
import { auditLogs, exchangeSettings, taxWithholdings, trades, userTaxProfiles, users } from '../../db/schema.ts';
import { applyBalanceChanges } from '../exchange/ledger.ts';
import { marketTrade, setBook } from '../../../test/helpers.ts';
import { ApiHarness } from '../../../test/apiHarness.ts';
import { TaxService } from './taxService.ts';

/** HTTP tests of batch T2 (module T §3.5): tax settings (admin) + taxpayer profile (user). Responses are validated against the contract. */
const h = new ApiHarness();

async function expectApiError(p: Promise<unknown>, code: string, status: number) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof ApiError && e.code === code && e.status === status);
}
/** Raw request (to send what the typed client would not: extra fields, wrong types). */
async function raw(b: { cookie: () => string }, method: string, path: string, body?: unknown) {
  const res = await fetch(`${h.base}${path}`, { method, headers: { 'content-type': 'application/json', cookie: b.cookie() }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as { error?: { code: string } } };
}
const taxAudits = async () => h.env.database.db.select().from(auditLogs).where(eq(auditLogs.action, 'TAX_SETTINGS_UPDATE')).orderBy(desc(auditLogs.id));

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

describe('taxpayer profile (user)', () => {
  it('default INDIVIDUAL / never chosen; PUT changes it; each user sees only their own', async () => {
    const a = await h.user();
    const b = await h.user();
    expect(await a.b.taxProfile()).toEqual({ category: 'INDIVIDUAL', updatedAt: null });
    const put = await a.b.taxUpdateProfile({ body: { category: 'DOMESTIC_ORG' } });
    expect(put.category).toBe('DOMESTIC_ORG');
    expect(put.updatedAt).not.toBeNull();
    expect(await a.b.taxProfile()).toEqual(put);
    expect(await b.b.taxProfile()).toEqual({ category: 'INDIVIDUAL', updatedAt: null }); // a's choice is not b's
    expect((await a.b.taxUpdateProfile({ body: { category: 'FOREIGN_ORG' } })).category).toBe('FOREIGN_ORG');
    expect(await h.env.database.db.select().from(userTaxProfiles).where(eq(userTaxProfiles.userId, a.id))).toHaveLength(1);
  });

  it('strict body: an extra field (e.g. an ID number) or an unknown category → 400; no session → 401', async () => {
    const a = await h.user();
    const extra = await raw(a.b, 'PUT', '/api/v1/account/tax/profile', { category: 'INDIVIDUAL', idNumber: '012345678901' });
    expect([extra.status, extra.body.error?.code]).toEqual([400, 'VALIDATION_ERROR']);
    const bad = await raw(a.b, 'PUT', '/api/v1/account/tax/profile', { category: 'NGO' });
    expect([bad.status, bad.body.error?.code]).toEqual([400, 'VALIDATION_ERROR']);
    expect(await h.env.database.db.select().from(userTaxProfiles).where(eq(userTaxProfiles.userId, a.id))).toEqual([]);
    const anon = h.browser();
    await expectApiError(anon.taxProfile(), 'UNAUTHENTICATED', 401);
    await expectApiError(anon.taxUpdateProfile({ body: { category: 'INDIVIDUAL' } }), 'UNAUTHENTICATED', 401);
  });
});

describe('tax settings (admin)', () => {
  it('server default: OFF, 0.001, no VND rate — and exchangeInfo says the same', async () => {
    const admin = await h.staff('admin');
    const s = await admin.b.adminTaxSettings();
    expect(s).toMatchObject({ taxMode: 'OFF', taxRate: '0.001', taxVndRate: null, taxVndRateUpdatedAt: null });
    const info = await h.browser().exchangeInfo();
    expect([info.taxMode, info.taxRate, info.taxVndRate, info.taxVndRateUpdatedAt]).toEqual(['OFF', '0.001', null, null]);
  });

  it('read needs tax.read, change needs tax.manage: user 403, support reads but cannot change (403), admin changes', async () => {
    const user = await h.user();
    await expectApiError(user.b.adminTaxSettings(), 'FORBIDDEN', 403);
    const support = await h.staff('support');
    expect((await support.b.adminTaxSettings()).taxMode).toBeDefined();
    const before = (await taxAudits()).length;
    await expectApiError(support.b.adminUpdateTaxSettings({ body: { taxMode: 'WITHHOLD', reason: 'support tries it' } }), 'FORBIDDEN', 403);
    expect((await taxAudits()).length).toBe(before);
    expect(h.env.ex.config.tax.mode).toBe('OFF');
  });

  it('PATCH: audited in the same change, cache updated right after (exchangeInfo + the next fill use it), null clears the VND rate', async () => {
    const admin = await h.staff('admin');
    const r = await admin.b.adminUpdateTaxSettings({ body: { taxMode: 'WITHHOLD', taxVndRate: '26350', reason: 'turn the test tax on' } });
    expect(r).toMatchObject({ taxMode: 'WITHHOLD', taxRate: '0.001', taxVndRate: '26350' });
    expect(r.taxVndRateUpdatedAt).not.toBeNull();
    const [audit] = await taxAudits();
    expect(audit).toMatchObject({ actorId: admin.id, targetType: 'EXCHANGE', reason: 'turn the test tax on', before: { taxMode: 'OFF', taxRate: '0.001', taxVndRate: null }, after: { taxMode: 'WITHHOLD', taxRate: '0.001', taxVndRate: '26350' } });
    const info = await h.browser().exchangeInfo();
    expect([info.taxMode, info.taxRate, info.taxVndRate]).toEqual(['WITHHOLD', '0.001', '26350']);

    // the next SELL fill is withheld with the new settings (no restart, no reload by hand)
    const seller = await h.user();
    await seller.b.faucetClaim({ body: {} });
    await seller.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' } });
    const sold = await seller.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.5' } });
    expect(sold.fills.map((t) => t.tax)).toEqual(['0.04950000']); // 0.5 × 99 × 0.001
    const [rec] = await h.env.database.db.select().from(taxWithholdings).where(eq(taxWithholdings.userId, seller.id));
    expect([rec!.vndRate !== null, rec!.taxVnd]).toEqual([true, '1305.000000000000000000']); // ceil(0.0495 × 26350 = 1304.325)
    const trades = await seller.b.myTrades({ query: { symbol: 'BTCUSDT' } });
    expect(trades.items.map((t) => [t.side, t.tax])).toEqual([
      ['SELL', '0.04950000'],
      ['BUY', '0.00000000'],
    ]);

    // rate only; then clear the VND rate (null) — the clear is audited too
    expect((await admin.b.adminUpdateTaxSettings({ body: { taxRate: '0.002', reason: 'double the rate' } })).taxRate).toBe('0.002');
    const cleared = await admin.b.adminUpdateTaxSettings({ body: { taxVndRate: null, reason: 'no reference rate' } });
    expect([cleared.taxVndRate, cleared.taxMode]).toEqual([null, 'WITHHOLD']);
    expect((await taxAudits())[0]).toMatchObject({ before: { taxVndRate: '26350' }, after: { taxVndRate: null } });
    expect((await admin.b.adminTaxSettings()).taxVndRate).toBeNull();
    await admin.b.adminUpdateTaxSettings({ body: { taxMode: 'OFF', taxRate: '0.001', reason: 'back to the default' } });
  });

  it('validation: rate 0, above 0.01, > 8 decimals, VND ≤ 0, nothing to change, short reason → 400 and nothing written', async () => {
    const admin = await h.staff('admin');
    const before = (await taxAudits()).length;
    for (const body of [
      { taxRate: '0', reason: 'zero rate' },
      { taxRate: '0.0100001', reason: 'above max' },
      { taxRate: '0.000000001', reason: 'too many decimals' },
      { taxVndRate: '0', reason: 'zero vnd' },
      { taxMode: 'ON', reason: 'bad mode' },
      { reason: 'nothing to change' },
      { taxMode: 'WITHHOLD', reason: 'abc' },
    ]) {
      const res = await raw(admin.b, 'PATCH', '/api/v1/admin/tax/settings', body);
      expect([res.status, res.body.error?.code], JSON.stringify(body)).toEqual([400, 'VALIDATION_ERROR']);
    }
    expect((await taxAudits()).length).toBe(before);
    expect(h.env.ex.config.tax.mode).toBe('OFF');
  });

  it('the change and its audit row commit together: an audit that cannot be written leaves the settings unchanged', async () => {
    const tax = new TaxService(h.env.database.db, h.env.ex.config);
    const [admin] = await h.env.database.db.select().from(users).where(eq(users.role, 'admin')).limit(1);
    // an actor id that is not a user → the audit insert fails (FK) → the whole transaction rolls back
    const ghost = { ...admin!, id: '00000000-0000-4000-8000-000000000000' };
    await expect(tax.updateSettings({ user: ghost }, { taxMode: 'WITHHOLD', reason: 'must roll back' })).rejects.toThrow();
    const [row] = await h.env.database.db.select().from(exchangeSettings).where(eq(exchangeSettings.id, 1));
    expect(row!.taxMode).toBe('OFF');
    expect(h.env.ex.config.tax.mode).toBe('OFF');
    const n = await h.env.database.db.select({ n: sql<number>`count(*)::int` }).from(auditLogs).where(and(eq(auditLogs.action, 'TAX_SETTINGS_UPDATE'), eq(auditLogs.reason, 'must roll back')));
    expect(n[0]!.n).toBe(0);
  });
});

/** Sells 0.5 BTC with the tax on (0.5 x 99 x 0.001 = 0.0495) and puts the settings back; returns the seller. */
async function sellWithTax() {
  const admin = await h.staff('admin');
  await admin.b.adminUpdateTaxSettings({ body: { taxMode: 'WITHHOLD', reason: 'tax on for a T3 test' } });
  try {
    const seller = await h.user();
    await seller.b.faucetClaim({ body: {} });
    await seller.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'BUY', type: 'MARKET', quantity: '1' } });
    await seller.b.placeOrder({ body: { symbol: 'BTCUSDT', side: 'SELL', type: 'MARKET', quantity: '0.5' } });
    return seller;
  } finally {
    await admin.b.adminUpdateTaxSettings({ body: { taxMode: 'OFF', reason: 'tax back off after a T3 test' } });
  }
}

describe('tax in the wallet ledger and the admin reconciliation (HTTP)', () => {
  it('the wallet ledger shows the TAX_WITHHOLDING line of the sale, in USDT, tied to the order', async () => {
    const seller = await sellWithTax();
    const ledger = await seller.b.ledger({ query: { asset: 'USDT' } });
    const taxLines = ledger.items.filter((l) => l.type === 'TAX_WITHHOLDING');
    expect(taxLines).toHaveLength(1);
    expect(taxLines[0]).toMatchObject({ account: 'SPOT', asset: 'USDT', deltaAvailable: '-0.04950000', deltaLocked: '0.00000000', refType: 'ORDER' });
    const [rec] = await h.env.database.db.select().from(taxWithholdings).where(eq(taxWithholdings.userId, seller.id));
    expect(taxLines[0]!.refId).toBe(String(rec!.orderId));
    // another user's ledger has no such line
    const other = await h.user();
    expect((await other.b.ledger({ query: {} })).items.filter((l) => l.type === 'TAX_WITHHOLDING')).toEqual([]);
  });

  it('adminRunReconciliation answers with both tax mismatch kinds (response validated against the contract) - keep this test last', async () => {
    const admin = await h.staff('admin');
    const seller = await sellWithTax();
    const clean = await admin.b.adminRunReconciliation();
    expect(clean.mismatches.filter((m) => m.kind.startsWith('TAX_'))).toEqual([]);
    // money taken as tax with no record + a trade whose tax was edited
    await h.env.database.db.transaction((tx) => applyBalanceChanges(tx, [{ userId: seller.id, asset: 'USDT', type: 'TAX_WITHHOLDING', deltaAvailable: dec('-0.01'), refType: 'ORDER', refId: 'x' }]));
    await h.env.database.db.update(trades).set({ tax: '0.0496' }).where(and(eq(trades.userId, seller.id), eq(trades.side, 'SELL')));
    const run = await admin.b.adminRunReconciliation();
    expect(run.ok).toBe(false);
    const kinds = run.mismatches.filter((m) => m.userId === seller.id && m.kind.startsWith('TAX_')).map((m) => [m.kind, m.asset, m.field, m.account, Number(m.expected), Number(m.actual)]);
    expect(kinds.sort()).toEqual(
      [
        ['TAX_LEDGER_VS_WITHHOLDINGS', 'USDT', 'available', 'SPOT', 0.0495, 0.0595],
        ['TAX_TRADES_VS_WITHHOLDINGS', 'USDT', 'available', 'SPOT', 0.0495, 0.0496],
      ].sort(),
    );
  });
});

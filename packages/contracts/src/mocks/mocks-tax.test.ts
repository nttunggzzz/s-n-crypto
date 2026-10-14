import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { dec, roundDown, roundUp } from '@cex/core';
import {
  ADMIN_TAX_EXPORT_COLUMNS,
  ApiError,
  createApiClient,
  endpoints,
  hasPermission,
  TAX_EXPORT_COLUMNS,
  TaxPeriod,
  TaxRateInput,
  Trade,
  UpdateTaxProfileRequest,
  UpdateTaxSettingsRequest,
  VndRateInput,
  type EndpointDef,
} from '../index.ts';
import { fixtureTaxedTrades, fixtureTaxWithholdings } from '../fixtures/index.ts';
import { createMockHandlers, mockStore, resetMockStore, setMockRole, setMockTax } from './index.ts';
import { mockTaxOfFill, taxPeriodRange } from './tax.ts';

const BASE = 'http://mock.local';
const server = setupServer(...createMockHandlers({ baseUrl: BASE, latencyMs: 0 }));
// validateResponses: every mock response must match the contract schema
const api = createApiClient({ baseUrl: BASE, validateResponses: true });
const code = (c: string) => (e: unknown) => e instanceof ApiError && e.code === c;
const usdt = () => mockStore.balances.USDT!.available;
const sell = (symbol: string, quantity: string) => api.placeOrder({ body: { symbol, side: 'SELL', type: 'MARKET', quantity } });
const buy = (symbol: string, quantity: string) => api.placeOrder({ body: { symbol, side: 'BUY', type: 'MARKET', quantity } });

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetMockStore();
  setMockRole('user', false);
});
afterAll(() => server.close());

describe('tax schemas (0.15.0)', () => {
  it('Trade.tax is required; rates and the profile body are validated', () => {
    const { tax: _tax, ...noTax } = fixtureTaxedTrades[0]!;
    expect(Trade.safeParse(noTax).success).toBe(false);
    expect(Trade.safeParse(fixtureTaxedTrades[0]).success).toBe(true);

    for (const ok of ['0.001', '0.01', '0.00000001', '0.0100']) expect(TaxRateInput.safeParse(ok).success).toBe(true);
    for (const bad of ['0', '0.0', '-0.001', '0.01000001', '0.011', '0.000000001', '1', 'abc', '1e-3']) expect(TaxRateInput.safeParse(bad).success).toBe(false);
    expect(VndRateInput.safeParse('26350').success).toBe(true);
    for (const bad of ['0', '-1', '26350.123456789']) expect(VndRateInput.safeParse(bad).success).toBe(false);

    expect(UpdateTaxProfileRequest.safeParse({ category: 'DOMESTIC_ORG' }).success).toBe(true);
    expect(UpdateTaxProfileRequest.safeParse({ category: 'INDIVIDUAL', idNumber: '012345678901' }).success).toBe(false);
    expect(UpdateTaxSettingsRequest.safeParse({ reason: 'không đổi gì cả' }).success).toBe(false);
    expect(UpdateTaxSettingsRequest.safeParse({ taxVndRate: null, reason: 'xóa tỷ giá tham khảo' }).success).toBe(true);

    for (const ok of ['2026-10', '2026-01', '2026-Q1', '2026-Q4']) expect(TaxPeriod.safeParse(ok).success).toBe(true);
    for (const bad of ['2026-13', '2026-Q5', '2026', '26-10', '2026-1']) expect(TaxPeriod.safeParse(bad).success).toBe(false);
  });

  it('staff tax endpoints declare permissions: support reads, admin manages', () => {
    const staff = Object.entries(endpoints).filter(([n]) => n.startsWith('adminTax') || n === 'adminUpdateTaxSettings') as [string, EndpointDef][];
    expect(staff.map(([n]) => n).sort()).toEqual(['adminTaxExport', 'adminTaxSettings', 'adminTaxSummary', 'adminTaxWithholdings', 'adminUpdateTaxSettings']);
    for (const [n, d] of staff) expect([n, d.auth, d.permission]).toEqual([n, 'staff', n === 'adminUpdateTaxSettings' ? 'tax.manage' : 'tax.read']);
    expect([hasPermission('support', 'tax.read'), hasPermission('support', 'tax.manage')]).toEqual([true, false]);
    expect([hasPermission('admin', 'tax.read'), hasPermission('admin', 'tax.manage'), hasPermission('owner', 'tax.manage')]).toEqual([true, true, true]);
    expect(hasPermission('user', 'tax.read')).toBe(false);
  });

  it('fixtures follow the rule: tax = roundUp8(gross × rate), grossVnd floor, taxVnd ceil', () => {
    for (const w of fixtureTaxWithholdings) {
      expect(dec(w.grossQuote).eq(dec(w.quantity).mul(dec(w.price)))).toBe(true);
      expect(w.taxAmount).toBe(roundUp(dec(w.grossQuote).mul(dec(w.taxRate))).toFixed(8));
      expect(w.grossVnd).toBe(w.vndRate === null ? null : roundDown(dec(w.grossQuote).mul(dec(w.vndRate)), 0).toFixed(0));
      expect(w.taxVnd).toBe(w.vndRate === null ? null : roundUp(dec(w.taxAmount).mul(dec(w.vndRate)), 0).toFixed(0));
    }
    for (const t of fixtureTaxedTrades) expect(fixtureTaxWithholdings.find((w) => w.tradeId === t.id)?.taxAmount).toBe(t.tax);
  });
});

describe('mock engine withholds like the server', () => {
  it('SELL: tax on the gross value, USDT credited = quote − fee − tax, realizedPnl after fee and tax, one record', async () => {
    const before = usdt();
    const r = await sell('ETHUSDT', '0.1');
    const t = r.fills[0]!;
    const quote = dec(t.quoteQty);
    expect(t.quoteQty).toBe('250.00000000');
    expect(t.fee).toBe(roundUp(quote.mul('0.001')).toFixed(8));
    expect(t.tax).toBe(roundUp(quote.mul('0.001')).toFixed(8));
    expect(t.tax).toBe('0.25000000');
    expect(dec(String(usdt())).sub(dec(String(before))).toFixed(8)).toBe(quote.sub(dec(t.fee)).sub(dec(t.tax)).toFixed(8));
    // ETH cost basis 2380.5 (portfolio fixture): 250 − 0.25 − 0.25 − 238.05
    expect(t.realizedPnl).toBe('11.45000000');

    const list = await api.taxWithholdings();
    expect(list.items[0]).toMatchObject({ tradeId: t.id, orderId: t.orderId, symbol: 'ETHUSDT', asset: 'USDT', quantity: t.quantity, price: t.price, grossQuote: t.quoteQty, taxRate: '0.001', taxAmount: t.tax, category: 'INDIVIDUAL', vndRate: '26350' });
    expect(list.items[0]).toMatchObject({ grossVnd: '6587500', taxVnd: '6588' }); // 250 × 26350; ceil(0.25 × 26350 = 6587.5)
    expect(list.items.filter((w) => w.tradeId === t.id)).toHaveLength(1);
    expect((await api.myTrades()).items.find((x) => x.id === t.id)?.tax).toBe(t.tax);
  });

  it('BUY is never withheld', async () => {
    const n = mockStore.tax.withholdings.length;
    const r = await buy('BNBUSDT', '1');
    expect(r.fills[0]!.tax).toBe('0.00000000');
    expect(r.fills[0]!.realizedPnl).toBeNull();
    expect(mockStore.tax.withholdings).toHaveLength(n);
  });

  it('DOMESTIC_ORG is not withheld; the profile takes only a category', async () => {
    expect(await api.taxProfile()).toEqual({ category: 'INDIVIDUAL', updatedAt: null });
    const p = await api.taxUpdateProfile({ body: { category: 'DOMESTIC_ORG' } });
    expect(p.category).toBe('DOMESTIC_ORG');
    expect(p.updatedAt).not.toBeNull();
    const n = mockStore.tax.withholdings.length;
    const r = await sell('ETHUSDT', '0.1');
    expect(r.fills[0]!.tax).toBe('0.00000000');
    expect(r.fills[0]!.realizedPnl).toBe('11.70000000'); // 250 − 0.25 − 238.05
    expect(mockStore.tax.withholdings).toHaveLength(n);
    await expect(api.taxUpdateProfile({ body: { category: 'INDIVIDUAL', idNumber: '012345678901' } as never })).rejects.toSatisfy(code('VALIDATION_ERROR'));
  });

  it('taxMode OFF withholds nothing (set by an admin, audited, public in exchangeInfo)', async () => {
    setMockRole('admin');
    const s = await api.adminUpdateTaxSettings({ body: { taxMode: 'OFF', reason: 'tắt thuế để thử nghiệm' } });
    expect(s.taxMode).toBe('OFF');
    expect(mockStore.auditLogs[0]).toMatchObject({ action: 'TAX_SETTINGS_UPDATE', targetType: 'EXCHANGE', reason: 'tắt thuế để thử nghiệm' });
    expect((await api.exchangeInfo()).taxMode).toBe('OFF');
    const n = mockStore.tax.withholdings.length;
    expect((await sell('ETHUSDT', '0.1')).fills[0]!.tax).toBe('0.00000000');
    expect(mockStore.tax.withholdings).toHaveLength(n);
  });

  it('rounds the tax UP at 1e-8', async () => {
    // 308.43 × 0.00000007 = 0.0000215901 → 0.00002160 (half-up would give 0.00002159)
    setMockTax({ taxRate: '0.00000007' });
    mockStore.prices.ETHUSDT = 3084.3;
    const t = (await sell('ETHUSDT', '0.1')).fills[0]!;
    expect(t.quoteQty).toBe('308.43000000');
    expect(t.tax).toBe('0.00002160');
    // smallest gross value: 0.00000001 × 0.001 → one unit of 1e-8
    setMockTax({ taxRate: '0.001' });
    expect(mockTaxOfFill('SELL', dec('0.00000001')).toFixed(8)).toBe('0.00000001');
    expect(mockTaxOfFill('BUY', dec('100')).toFixed(8)).toBe('0.00000000');
  });

  it('a journaled SELL carries tax and allocatedTax', async () => {
    await buy('BNBUSDT', '1');
    const t = (await sell('BNBUSDT', '0.5')).fills[0]!;
    expect(t.tax).not.toBe('0.00000000');
    const entry = (await api.journalList({ query: { symbol: 'BNBUSDT' } })).items[0]!;
    const fills = (await api.journalGet({ params: { entryId: entry.id } })).fills;
    expect(fills.find((f) => f.side === 'BUY')).toMatchObject({ tax: '0.00000000', allocatedTax: '0.00000000' });
    expect(fills.find((f) => f.tradeId === t.id)).toMatchObject({ tax: t.tax, allocatedTax: t.tax });
  });
});

describe('tax reports are consistent with the records', () => {
  it('user summary: 12 months, totals = Σ months = the list; VND null while a record has no rate', async () => {
    const s = await api.taxSummary({ query: { year: 2026 } });
    expect(s.months.map((m) => m.month)).toEqual(Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`));
    expect(s.totals).toMatchObject({ withholdingCount: 2, withheldGrossQuote: '856.50000000', taxAmount: '0.85650000', vndMissingCount: 1, withheldGrossVnd: null, taxVnd: null });
    expect(s.totals).toMatchObject({ sellCount: 2, sellGrossQuote: '856.50000000', sellFees: '0.85650000', realizedPnl: '26.66200000', sellsWithoutCostBasis: 0 });
    expect(s.months.find((m) => m.month === '2026-09')).toMatchObject({ withholdingCount: 1, taxAmount: '0.61250000', withheldGrossVnd: '16108750', taxVnd: '16109', vndMissingCount: 0 });
    expect(s.months.find((m) => m.month === '2026-10')).toMatchObject({ withholdingCount: 0, taxAmount: '0.00000000', withheldGrossVnd: '0', taxVnd: '0' });
    expect(s.months.reduce((n, m) => n + m.withholdingCount, 0)).toBe(s.totals.withholdingCount);
    expect((await api.taxWithholdings()).items).toHaveLength(s.totals.withholdingCount);
    expect((await api.taxSummary({ query: { year: 2025 } })).totals.withholdingCount).toBe(0);

    // a new withheld SELL appears in its month, the totals and the CSV
    const t = (await sell('ETHUSDT', '0.1')).fills[0]!;
    const year = Number(new Date(Date.parse(t.createdAt) + 7 * 3600_000).toISOString().slice(0, 4));
    const after = await api.taxSummary({ query: { year } });
    expect(after.totals.withholdingCount).toBe(year === 2026 ? 3 : 1);
    const csv = await api.taxExport();
    const lines = csv.trim().split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true); // BOM for Excel (trim() drops it)
    expect(lines[0]).toBe(TAX_EXPORT_COLUMNS.join(','));
    expect(lines).toHaveLength(1 + 3);
    expect(lines[1]!.split(',').slice(1, 3)).toEqual([t.id, t.orderId]);
  });

  it('user records: own only, filters and cursor pages', async () => {
    const all = await api.taxWithholdings();
    expect(all.items.map((w) => w.tradeId)).toEqual(['382', '381']);
    expect('userId' in all.items[0]!).toBe(false);
    expect((await api.taxWithholdings({ query: { symbol: 'BTCUSDT' } })).items.map((w) => w.tradeId)).toEqual(['381']);
    expect((await api.taxWithholdings({ query: { from: '2026-09-01T00:00:00.000Z' } })).items.map((w) => w.tradeId)).toEqual(['382']);
    const p1 = await api.taxWithholdings({ query: { limit: 1 } });
    expect(p1.nextCursor).toBe(p1.items[0]!.id);
    const p2 = await api.taxWithholdings({ query: { limit: 1, cursor: p1.nextCursor! } });
    expect([p2.items.map((w) => w.tradeId), p2.nextCursor]).toEqual([['381'], null]);
  });

  it('admin: permissions, period summary by category and pair, list, CSV', async () => {
    await expect(api.adminTaxSettings()).rejects.toSatisfy(code('FORBIDDEN'));
    setMockRole('support');
    expect((await api.adminTaxSettings()).taxMode).toBe('WITHHOLD');
    await expect(api.adminUpdateTaxSettings({ body: { taxRate: '0.002', reason: 'thử đổi tỷ lệ' } })).rejects.toSatisfy(code('FORBIDDEN'));
    setMockRole('admin');
    await expect(api.adminUpdateTaxSettings({ body: { taxRate: '0.02', reason: 'quá mức trần' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));
    const s = await api.adminUpdateTaxSettings({ body: { taxVndRate: null, reason: 'xóa tỷ giá tham khảo' } });
    expect(s.taxVndRate).toBeNull();
    expect(s.taxVndRateUpdatedAt).not.toBeNull();

    expect(taxPeriodRange('2026-10')).toEqual({ from: '2026-09-30T17:00:00.000Z', to: '2026-10-31T16:59:59.999Z' });
    expect(taxPeriodRange('2026-Q3')).toEqual({ from: '2026-06-30T17:00:00.000Z', to: '2026-09-30T16:59:59.999Z' });
    const oct = await api.adminTaxSummary({ query: { period: '2026-10' } });
    expect(oct).toMatchObject({ period: '2026-10', from: '2026-09-30T17:00:00.000Z', to: '2026-10-31T16:59:59.999Z', asset: 'USDT' });
    expect(oct.totals).toMatchObject({ withholdingCount: 2, userCount: 2, withheldGrossQuote: '1175.92500000', taxAmount: '1.17592500', withheldGrossVnd: '30985623', taxVnd: '30986', vndMissingCount: 0 });
    expect(oct.byCategory.map((c) => [c.category, c.withholdingCount])).toEqual([['INDIVIDUAL', 1], ['FOREIGN_ORG', 1], ['DOMESTIC_ORG', 0]]);
    expect(oct.bySymbol.map((g) => [g.symbol, g.taxAmount])).toEqual([['BTCUSDT', '0.80000000'], ['SOLUSDT', '0.37592500']]);
    const q3 = await api.adminTaxSummary({ query: { period: '2026-Q3' } });
    expect(q3.totals).toMatchObject({ withholdingCount: 2, userCount: 1, vndMissingCount: 1, taxVnd: null });
    await expect(api.adminTaxSummary({ query: { period: '2026-13' } })).rejects.toSatisfy(code('VALIDATION_ERROR'));

    const list = await api.adminTaxWithholdings({ query: { from: oct.from, to: oct.to } });
    expect(list.items.map((w) => w.userId)).toEqual(['00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003']);
    expect((await api.adminTaxWithholdings({ query: { userId: '00000000-0000-4000-8000-000000000001' } })).items).toHaveLength(2);
    const csv = await api.adminTaxExport({ query: { from: oct.from, to: oct.to } });
    const lines = csv.trim().split('\r\n');
    expect(csv.startsWith('﻿')).toBe(true); // BOM for Excel (trim() drops it)
    expect(lines[0]).toBe(ADMIN_TAX_EXPORT_COLUMNS.join(','));
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('FOREIGN_ORG');
  });
});

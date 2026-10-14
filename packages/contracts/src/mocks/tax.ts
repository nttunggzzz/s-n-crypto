/**
 * ⚠️ Mock resolvers + fill-time rule of the Vietnam tax (0.15.0) — UI development only.
 * Every amount uses @cex/core Dec with the server's rounding ("mock = server"):
 *   tax = roundUp8(quoteQty × taxRate) on SELL fills only, when WITHHOLD and the user is not DOMESTIC_ORG;
 *   grossVnd = floor(gross × vndRate), taxVnd = ceil(tax × vndRate); VND totals null as soon as one record lacks a rate.
 */
import { dec, roundDown, roundUp, ZERO, type Dec } from '@cex/core';
import type { AdminTaxWithholding, EndpointName, TaxCategory, TaxTotals, Trade } from '../index.ts';
import { ADMIN_TAX_EXPORT_COLUMNS, TAX_EXPORT_COLUMNS, TAX_LIMITS, TaxCategory as TaxCategoryEnum } from '../tax.ts';
import { fixtureMe } from '../fixtures/index.ts';
import { now, requireStaff, requireUser, type Resolver } from './common.ts';
import { audit } from './admin.ts';
import { mockStore } from './store.ts';

const f8 = (d: Dec) => d.toFixed(8);
const VN_OFFSET_MS = 7 * 3600_000;
/** "YYYY-MM-DD HH:mm:ss" in Vietnam time (UTC+7), like the other CSV exports. */
const vnTime = (iso: string) => new Date(Date.parse(iso) + VN_OFFSET_MS).toISOString().replace('T', ' ').slice(0, 19);
const vnMonth = (iso: string) => new Date(Date.parse(iso) + VN_OFFSET_MS).toISOString().slice(0, 7);
const me = () => fixtureMe.id;

// ───────────────────────────── fill-time rule (called by the mock engine)

/** Tax of one fill — "0" when not withheld. Same rule as the server's settleFills (module T §3.2). */
export function mockTaxOfFill(side: 'BUY' | 'SELL', quoteQty: Dec): Dec {
  const t = mockStore.tax;
  if (side !== 'SELL' || t.settings.taxMode !== 'WITHHOLD' || t.category === 'DOMESTIC_ORG') return ZERO;
  return roundUp(quoteQty.mul(dec(t.settings.taxRate)));
}

/** The withholding record of a withheld fill (one per trade). */
export function mockRecordWithholding(trade: Trade): void {
  const tax = dec(trade.tax);
  if (tax.isZero()) return;
  const t = mockStore.tax;
  const rate = t.settings.taxVndRate;
  const gross = dec(trade.quoteQty);
  t.withholdings.unshift({
    id: String(t.nextWithholding++),
    userId: me(),
    tradeId: trade.id,
    orderId: trade.orderId,
    symbol: trade.symbol,
    asset: trade.feeAsset,
    quantity: trade.quantity,
    price: trade.price,
    grossQuote: trade.quoteQty,
    taxRate: t.settings.taxRate,
    taxAmount: trade.tax,
    category: t.category,
    vndRate: rate,
    grossVnd: rate === null ? null : roundDown(gross.mul(dec(rate)), 0).toFixed(0),
    taxVnd: rate === null ? null : roundUp(tax.mul(dec(rate)), 0).toFixed(0),
    createdAt: trade.createdAt,
  });
}

// ───────────────────────────── totals

function totals(rows: AdminTaxWithholding[]): TaxTotals {
  const missing = rows.filter((w) => w.vndRate === null).length;
  const sum = (pick: (w: AdminTaxWithholding) => string) => rows.reduce((s, w) => s.add(dec(pick(w))), ZERO);
  return {
    withholdingCount: rows.length,
    withheldGrossQuote: f8(sum((w) => w.grossQuote)),
    taxAmount: f8(sum((w) => w.taxAmount)),
    withheldGrossVnd: missing > 0 ? null : sum((w) => w.grossVnd!).toFixed(0),
    taxVnd: missing > 0 ? null : sum((w) => w.taxVnd!).toFixed(0),
    vndMissingCount: missing,
  };
}

function sales(trades: Trade[]) {
  const sells = trades.filter((t) => t.side === 'SELL');
  const withPnl = sells.filter((t) => t.realizedPnl !== null);
  return {
    sellCount: sells.length,
    sellGrossQuote: f8(sells.reduce((s, t) => s.add(dec(t.quoteQty)), ZERO)),
    sellFees: f8(sells.reduce((s, t) => s.add(dec(t.fee)), ZERO)),
    realizedPnl: f8(withPnl.reduce((s, t) => s.add(dec(t.realizedPnl!)), ZERO)),
    sellsWithoutCostBasis: sells.length - withPnl.length,
  };
}

const adminGroup = (rows: AdminTaxWithholding[]) => ({ ...totals(rows), userCount: new Set(rows.map((w) => w.userId)).size });

// ───────────────────────────── filters, paging, CSV

interface Filter {
  userId?: string | null;
  symbol?: string | null;
  from?: string | null;
  to?: string | null;
}
const filterRows = (f: Filter) =>
  mockStore.tax.withholdings.filter(
    (w) =>
      (!f.userId || w.userId === f.userId) &&
      (!f.symbol || w.symbol === f.symbol) &&
      (!f.from || Date.parse(w.createdAt) >= Date.parse(f.from)) &&
      (!f.to || Date.parse(w.createdAt) <= Date.parse(f.to)),
  );
const filterOf = (q: URLSearchParams, userId: string | null): Filter => ({ userId, symbol: q.get('symbol'), from: q.get('from'), to: q.get('to') });

/** Newest first; the cursor is the id of the last record of the previous page. */
function page<T extends { id: string }>(rows: T[], q: URLSearchParams): { items: T[]; nextCursor: string | null } {
  const limit = Number(q.get('limit') ?? 50);
  const cursor = q.get('cursor');
  const start = cursor === null ? 0 : rows.findIndex((r) => r.id === cursor) + 1;
  if (cursor !== null && start === 0) return { items: [], nextCursor: null };
  const items = rows.slice(start, start + limit);
  return { items, nextCursor: start + limit < rows.length ? items[items.length - 1]!.id : null };
}

function csv(header: readonly string[], rows: (string | null)[][]): string {
  const esc = (v: string | null) => (v === null ? '' : /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}
const userOnly = ({ userId: _userId, ...w }: AdminTaxWithholding) => w;

// ───────────────────────────── periods (UTC+7)

/** [from, to] of a YYYY-MM / YYYY-Qn period in Vietnam time, as UTC instants; `to` is the last millisecond (inclusive, like TimeRangeQuery). */
export function taxPeriodRange(period: string): { from: string; to: string } {
  const [y, p] = period.split('-') as [string, string];
  const year = Number(y);
  const [m0, m1] = p.startsWith('Q') ? [(Number(p.slice(1)) - 1) * 3, Number(p.slice(1)) * 3] : [Number(p) - 1, Number(p)];
  const from = Date.UTC(year, m0, 1) - VN_OFFSET_MS;
  const to = Date.UTC(year, m1, 1) - VN_OFFSET_MS - 1;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

const currentVnYear = () => Number(vnMonth(now()).slice(0, 4));

type TaxEndpoint = 'taxProfile' | 'taxUpdateProfile' | 'taxSummary' | 'taxWithholdings' | 'taxExport' | 'adminTaxSettings' | 'adminUpdateTaxSettings' | 'adminTaxSummary' | 'adminTaxWithholdings' | 'adminTaxExport';

export const taxResolvers: { [N in Extract<EndpointName, TaxEndpoint>]: Resolver<N> } = {
  taxProfile: () => (requireUser(), { category: mockStore.tax.category, updatedAt: mockStore.tax.profileUpdatedAt }),
  taxUpdateProfile: ({ body }) => {
    requireUser();
    mockStore.tax.category = body.category as TaxCategory;
    mockStore.tax.profileUpdatedAt = now();
    return { category: mockStore.tax.category, updatedAt: mockStore.tax.profileUpdatedAt };
  },
  taxSummary: ({ query }) => {
    requireUser();
    const year = query.get('year') === null ? currentVnYear() : Number(query.get('year'));
    const inYear = (iso: string) => vnMonth(iso).startsWith(`${year}-`);
    const mine = filterRows({ userId: me() }).filter((w) => inYear(w.createdAt));
    const trades = mockStore.trades.filter((t) => inYear(t.createdAt));
    const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).map((month) => ({
      month,
      ...totals(mine.filter((w) => vnMonth(w.createdAt) === month)),
      ...sales(trades.filter((t) => vnMonth(t.createdAt) === month)),
    }));
    return { year, asset: 'USDT', category: mockStore.tax.category, totals: { ...totals(mine), ...sales(trades) }, months };
  },
  taxWithholdings: ({ query }) => {
    requireUser();
    const p = page(filterRows(filterOf(query, me())), query);
    return { items: p.items.map(userOnly), nextCursor: p.nextCursor };
  },
  taxExport: ({ query }) => {
    requireUser();
    const rows = filterRows(filterOf(query, me())).slice(0, TAX_LIMITS.exportMaxRows);
    return csv(
      TAX_EXPORT_COLUMNS,
      rows.map((w) => [w.id, w.tradeId, w.orderId, w.createdAt, vnTime(w.createdAt), w.symbol, w.quantity, w.price, w.grossQuote, w.asset, w.taxRate, w.taxAmount, w.category, w.vndRate, w.grossVnd, w.taxVnd]),
    );
  },

  adminTaxSettings: () => (requireStaff('tax.read'), mockStore.tax.settings),
  adminUpdateTaxSettings: ({ body }) => {
    requireStaff('tax.manage');
    const s = mockStore.tax.settings;
    const before = { ...s };
    const t = now();
    if (body.taxMode !== undefined) s.taxMode = body.taxMode as typeof s.taxMode;
    if (body.taxRate !== undefined) s.taxRate = dec(String(body.taxRate)).toFixed();
    if (body.taxVndRate !== undefined) {
      s.taxVndRate = body.taxVndRate === null ? null : dec(String(body.taxVndRate)).toFixed();
      s.taxVndRateUpdatedAt = t;
    }
    s.updatedAt = t;
    audit({ action: 'TAX_SETTINGS_UPDATE', targetType: 'EXCHANGE', targetId: null, before, after: { ...s }, reason: String(body.reason) });
    return s;
  },
  adminTaxSummary: ({ query }) => {
    requireStaff('tax.read');
    const period = query.get('period')!;
    const { from, to } = taxPeriodRange(period);
    const rows = filterRows({ from, to });
    const symbols = [...new Set(rows.map((w) => w.symbol))];
    const bySymbol = symbols
      .map((symbol) => ({ symbol, ...adminGroup(rows.filter((w) => w.symbol === symbol)) }))
      .sort((a, b) => dec(b.taxAmount).cmp(dec(a.taxAmount)) || a.symbol.localeCompare(b.symbol));
    return {
      period,
      from,
      to,
      asset: 'USDT',
      totals: adminGroup(rows),
      byCategory: TaxCategoryEnum.options.map((category) => ({ category, ...adminGroup(rows.filter((w) => w.category === category)) })),
      bySymbol,
    };
  },
  adminTaxWithholdings: ({ query }) => (requireStaff('tax.read'), page(filterRows(filterOf(query, query.get('userId'))), query)),
  adminTaxExport: ({ query }) => {
    requireStaff('tax.read');
    const rows = filterRows(filterOf(query, query.get('userId'))).slice(0, TAX_LIMITS.exportMaxRows);
    return csv(
      ADMIN_TAX_EXPORT_COLUMNS,
      rows.map((w) => [w.id, w.tradeId, w.orderId, w.createdAt, vnTime(w.createdAt), w.userId, w.symbol, w.quantity, w.price, w.grossQuote, w.asset, w.taxRate, w.taxAmount, w.category, w.vndRate, w.grossVnd, w.taxVnd]),
    );
  },
};

/** Dev helper (toolbar / tests): change the mock's tax settings and the demo user's category without the admin API. */
export function setMockTax(p: { taxMode?: 'OFF' | 'WITHHOLD'; taxRate?: string; taxVndRate?: string | null; category?: TaxCategory }): void {
  const s = mockStore.tax.settings;
  if (p.taxMode !== undefined) s.taxMode = p.taxMode;
  if (p.taxRate !== undefined) s.taxRate = p.taxRate;
  if (p.taxVndRate !== undefined) {
    s.taxVndRate = p.taxVndRate;
    s.taxVndRateUpdatedAt = now();
  }
  if (p.category !== undefined) mockStore.tax.category = p.category;
}
